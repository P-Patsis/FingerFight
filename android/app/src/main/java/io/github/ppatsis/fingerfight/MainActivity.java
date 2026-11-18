package io.github.ppatsis.fingerfight;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LauncherIcons.schedule(getApplicationContext());
    }
    @Override public void onStart() {
        super.onStart();
        LauncherIcons.setVisible(true);
    }
    @Override public void onStop() {
        LauncherIcons.setVisible(false);
        super.onStop();
        LauncherIcons.catchUp(getApplicationContext());
    }
}
