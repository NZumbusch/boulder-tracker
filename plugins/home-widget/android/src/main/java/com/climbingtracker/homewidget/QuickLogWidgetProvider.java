package com.climbingtracker.homewidget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** 4x1: quick-log buttons. */
public class QuickLogWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, WidgetRenderer.quickLog(context, WidgetRenderer.heightDp(manager, id)));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        manager.updateAppWidget(id, WidgetRenderer.quickLog(context, WidgetRenderer.heightDp(manager, id)));
    }
}
