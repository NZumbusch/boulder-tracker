package com.climbingtracker.healthconnect

import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.reflect.KClass

/**
 * Read-only access to Health Connect: resting heart rate, weight and sleep.
 *
 * Returns raw readings, each with the local calendar day it belongs to (from
 * the record's own zone offset, so a reading taken while travelling lands on
 * the day it happened there). Turning readings into one value per day, and
 * deciding what to store, happens in TypeScript (src/lib/health/), where it
 * is tested.
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val readPermissions = setOf(
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
    )

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    private fun client() = HealthConnectClient.getOrCreate(context)

    /** "available", "notInstalled" (Android 13 and older without the app) or "updateRequired". */
    @PluginMethod
    fun availability(call: PluginCall) {
        val status = when (HealthConnectClient.getSdkStatus(context, PROVIDER)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "updateRequired"
            else -> "notInstalled"
        }
        call.resolve(JSObject().put("status", status))
    }

    /** Which of the app's read permissions are granted, and whether past data (older than 30 days) may be read. */
    @PluginMethod
    fun getHealthPermissions(call: PluginCall) {
        scope.launch {
            try {
                call.resolve(permissionState(client().permissionController.getGrantedPermissions()))
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect is not available", e)
            }
        }
    }

    /** Opens Health Connect's own permission screen; resolves with the resulting state. */
    @PluginMethod
    fun requestHealthPermissions(call: PluginCall) {
        scope.launch {
            try {
                val wanted = readPermissions.toMutableSet()
                val historySupported = client().features.getFeatureStatus(
                    HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY
                ) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
                if (historySupported) wanted.add(HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY)
                val intent = PermissionController.createRequestPermissionResultContract(PROVIDER)
                    .createIntent(context, wanted)
                startActivityForResult(call, intent, "permissionsResult")
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not open Health Connect", e)
            }
        }
    }

    @ActivityCallback
    private fun permissionsResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        scope.launch {
            try {
                call.resolve(permissionState(client().permissionController.getGrantedPermissions()))
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect is not available", e)
            }
        }
    }

    /** Health Connect's settings (Android 14+ system settings, else its app), or its Play Store page when it isn't installed. */
    @PluginMethod
    fun openSettings(call: PluginCall) {
        val installed = HealthConnectClient.getSdkStatus(context, PROVIDER) != HealthConnectClient.SDK_UNAVAILABLE
        val intent = if (installed) {
            Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
        } else {
            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PROVIDER")).setPackage("com.android.vending")
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$PROVIDER"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
        call.resolve()
    }

    /**
     * Readings between `from` and `to` (ISO instants). Only the types that
     * are granted are read; the others come back empty.
     */
    @PluginMethod
    fun read(call: PluginCall) {
        val from = call.getString("from")
        val to = call.getString("to")
        if (from == null || to == null) {
            call.reject("from and to are required")
            return
        }
        scope.launch {
            try {
                val range = TimeRangeFilter.between(Instant.parse(from), Instant.parse(to))
                val granted = client().permissionController.getGrantedPermissions()
                val restingHeartRate = JSArray()
                val weight = JSArray()
                val sleep = JSArray()

                if (HealthPermission.getReadPermission(RestingHeartRateRecord::class) in granted) {
                    readAll(RestingHeartRateRecord::class, range).forEach { r ->
                        restingHeartRate.put(reading(r.time, r.zoneOffset).put("bpm", r.beatsPerMinute))
                    }
                }
                if (HealthPermission.getReadPermission(WeightRecord::class) in granted) {
                    readAll(WeightRecord::class, range).forEach { r ->
                        weight.put(reading(r.time, r.zoneOffset).put("kg", r.weight.inKilograms))
                    }
                }
                if (HealthPermission.getReadPermission(SleepSessionRecord::class) in granted) {
                    readAll(SleepSessionRecord::class, range).forEach { r ->
                        val awakeMs = r.stages
                            .filter { it.stage in AWAKE_STAGES }
                            .sumOf { it.endTime.toEpochMilli() - it.startTime.toEpochMilli() }
                        val totalMs = r.endTime.toEpochMilli() - r.startTime.toEpochMilli()
                        // A night belongs to the day you wake up on.
                        sleep.put(
                            reading(r.endTime, r.endZoneOffset)
                                .put("asleepMinutes", ((totalMs - awakeMs) / 60000.0))
                                .put("source", r.metadata.dataOrigin.packageName)
                        )
                    }
                }

                call.resolve(
                    JSObject()
                        .put("restingHeartRate", restingHeartRate)
                        .put("weight", weight)
                        .put("sleep", sleep)
                )
            } catch (e: Exception) {
                call.reject(e.message ?: "Reading Health Connect failed", e)
            }
        }
    }

    private suspend fun <T : Record> readAll(type: KClass<T>, range: TimeRangeFilter): List<T> {
        val out = mutableListOf<T>()
        var pageToken: String? = null
        do {
            val response = client().readRecords(ReadRecordsRequest(type, range, pageToken = pageToken))
            out.addAll(response.records)
            pageToken = response.pageToken
        } while (!pageToken.isNullOrEmpty())
        return out
    }

    private fun reading(time: Instant, offset: ZoneOffset?): JSObject {
        val zone: ZoneId = offset ?: ZoneId.systemDefault()
        return JSObject()
            .put("time", time.toString())
            .put("date", time.atZone(zone).toLocalDate().toString())
    }

    private fun permissionState(granted: Set<String>): JSObject {
        val kinds = JSArray()
        if (HealthPermission.getReadPermission(RestingHeartRateRecord::class) in granted) kinds.put("restingHeartRate")
        if (HealthPermission.getReadPermission(WeightRecord::class) in granted) kinds.put("weight")
        if (HealthPermission.getReadPermission(SleepSessionRecord::class) in granted) kinds.put("sleep")
        return JSObject()
            .put("granted", kinds)
            .put("history", HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY in granted)
    }

    companion object {
        private const val PROVIDER = "com.google.android.apps.healthdata"
        private val AWAKE_STAGES = setOf(
            SleepSessionRecord.STAGE_TYPE_AWAKE,
            SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
            SleepSessionRecord.STAGE_TYPE_OUT_OF_BED,
        )
    }
}
