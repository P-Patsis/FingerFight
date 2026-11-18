package io.github.ppatsis.fingerfight;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

final class LauncherIcons {
    static final int PERIODIC_JOB = 464601;
    private static final int CATCH_UP_JOB = 464602;
    private static volatile boolean visible;
    private static final Random RANDOM = new Random();

    static void setVisible(boolean value) { visible = value; }

    static void schedule(Context context) {
        try {
            JobScheduler scheduler = context.getSystemService(JobScheduler.class);
            if (scheduler == null) return;
            JobInfo existing = scheduler.getPendingJob(PERIODIC_JOB);
            if (existing == null || existing.getIntervalMillis() != LauncherIconPolicy.INTERVAL_MS) {
                JobInfo job = new JobInfo.Builder(PERIODIC_JOB, new ComponentName(context, LauncherIconJob.class))
                    .setPeriodic(LauncherIconPolicy.INTERVAL_MS, LauncherIconPolicy.FLEX_MS)
                    .setPersisted(true).build();
                if (scheduler.schedule(job) != JobScheduler.RESULT_SUCCESS) Log.w("FingerFightIcon", "Icon job not scheduled");
            }
        } catch (RuntimeException error) { Log.w("FingerFightIcon", "Icon scheduling unavailable", error); }
    }

    static void catchUp(Context context) {
        if (!LauncherIconPolicy.due(prefs(context).getLong("last", 0), System.currentTimeMillis())) return;
        try {
            JobScheduler scheduler = context.getSystemService(JobScheduler.class);
            if (scheduler != null && scheduler.getPendingJob(CATCH_UP_JOB) == null) {
                scheduler.schedule(new JobInfo.Builder(CATCH_UP_JOB, new ComponentName(context, LauncherIconJob.class))
                    .setMinimumLatency(2000L).build());
            }
        } catch (RuntimeException error) { Log.w("FingerFightIcon", "Icon catch-up unavailable", error); }
    }

    // Periodic and catch-up jobs can overlap: serialize component changes and the timestamp commit.
    static synchronized void rotateIfDue(Context context, boolean periodic) {
        if (visible) return; // Never change launcher components while the game is visible.
        SharedPreferences saved = prefs(context);
        long now = System.currentTimeMillis();
        if (!LauncherIconPolicy.due(saved.getLong("last", 0), now, periodic)) return;
        PackageManager manager = context.getPackageManager();
        List<Integer> enabled = new ArrayList<>();
        for (int i = 0; i < LauncherIconCatalog.NAMES.length; i++) {
            int state = manager.getComponentEnabledSetting(component(context, i));
            if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
                (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && i == LauncherIconCatalog.DEFAULT_INDEX)) enabled.add(i);
        }
        int current = enabled.size() == 1 ? enabled.get(0) : saved.getInt("index", LauncherIconCatalog.DEFAULT_INDEX);
        int next = LauncherIconPolicy.next(current, LauncherIconCatalog.SKIN_COUNT, LauncherIconCatalog.POSE_COUNT, RANDOM);
        if (visible) return;
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                List<PackageManager.ComponentEnabledSetting> changes = new ArrayList<>();
                changes.add(new PackageManager.ComponentEnabledSetting(component(context, next), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP));
                for (int i : enabled) if (i != next) changes.add(new PackageManager.ComponentEnabledSetting(component(context, i), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP));
                manager.setComponentEnabledSettings(changes);
            } else {
                // Enable first: older Android versions must always retain a usable launcher entry.
                manager.setComponentEnabledSetting(component(context, next), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
                for (int i : enabled) if (i != next) manager.setComponentEnabledSetting(component(context, i), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            }
            saved.edit().putInt("index", next).putLong("last", now).commit();
        } catch (RuntimeException error) {
            // The real MainActivity/deep links are never disabled. Restore a usable previous alias if possible.
            try {
                int fallback = enabled.isEmpty() ? LauncherIconCatalog.DEFAULT_INDEX : enabled.get(0);
                manager.setComponentEnabledSetting(component(context, fallback), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
                if (fallback != next) manager.setComponentEnabledSetting(component(context, next), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            } catch (RuntimeException ignored) { /* Retry only on the next scheduled run. */ }
            Log.w("FingerFightIcon", "Icon rotation deferred", error);
        }
    }

    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences("launcher-icons", Context.MODE_PRIVATE); }
    private static ComponentName component(Context context, int index) {
        // Component package varies for .debug; class namespace is stable for both variants.
        return new ComponentName(context.getPackageName(), LauncherIcons.class.getPackage().getName() + ".icon.Icon_" + LauncherIconCatalog.NAMES[index]);
    }
    private LauncherIcons() {}
}
