package io.github.ppatsis.fingerfight;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.util.Log;

public final class LauncherIconJob extends JobService {
    @Override public boolean onStartJob(JobParameters parameters) {
        new Thread(() -> {
            try { LauncherIcons.rotateIfDue(getApplicationContext(), parameters.getJobId() == LauncherIcons.PERIODIC_JOB); }
            catch (RuntimeException error) { Log.w("FingerFightIcon", "Icon update unavailable", error); }
            finally { jobFinished(parameters, false); }
        }, "FingerFightIcon").start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters parameters) { return false; }
}
