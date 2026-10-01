package com.climbingtracker.homewidget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** 2x2: this week's load, plan progress and ACWR. */
public class LoadWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, WidgetRenderer.load(context, WidgetRenderer.heightDp(manager, id)));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        manager.updateAppWidget(id, WidgetRenderer.load(context, WidgetRenderer.heightDp(manager, id)));
    }
}
