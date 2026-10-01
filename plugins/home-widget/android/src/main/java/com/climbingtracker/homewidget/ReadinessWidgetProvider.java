package com.climbingtracker.homewidget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** 2x2: today's readiness ring - with the factors or today's numbers underneath when stretched tall. */
public class ReadinessWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, WidgetRenderer.readiness(context, WidgetRenderer.heightDp(manager, id)));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        manager.updateAppWidget(id, WidgetRenderer.readiness(context, WidgetRenderer.heightDp(manager, id)));
    }
}
