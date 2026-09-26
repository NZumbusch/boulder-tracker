package com.climbingtracker.healthconnect

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/** What Health Connect opens for "why does this app want this data?": the privacy policy, in the browser. */
class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_URL)))
        finish()
    }

    companion object {
        const val PRIVACY_URL = "https://bouldertracker.nathanzumbusch.de/privacy.html#health-connect"
    }
}
