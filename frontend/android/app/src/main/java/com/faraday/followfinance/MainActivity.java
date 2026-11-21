package com.faraday.followfinance;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SharedPdfPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
