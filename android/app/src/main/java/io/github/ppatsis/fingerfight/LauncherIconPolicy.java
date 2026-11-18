package io.github.ppatsis.fingerfight;

import java.util.Random;

// Pure policy, also exercised on the JVM without Android framework mocks.
final class LauncherIconPolicy {
    static final long INTERVAL_MS = 60L * 60L * 1000L;
    static final long FLEX_MS = 15L * 60L * 1000L;

    static boolean due(long last, long now) {
        return due(last, now, false);
    }

    static boolean due(long last, long now, boolean periodic) {
        // JobScheduler may run inside the flex window; do not accidentally skip an entire cycle.
        long delay = INTERVAL_MS - (periodic ? FLEX_MS : 0);
        return last <= 0 || now < last || now - last >= delay;
    }

    static int next(int current, int skins, int poses, Random random) {
        if (skins < 2 || poses < 2) throw new IllegalArgumentException("Icon variety required");
        if (current < 0 || current >= skins * poses) current = 0;
        int choice = random.nextInt((skins - 1) * (poses - 1));
        int skin = choice / (poses - 1), pose = choice % (poses - 1);
        if (skin >= current / poses) skin++;
        if (pose >= current % poses) pose++;
        return skin * poses + pose;
    }

    private LauncherIconPolicy() {}
}
