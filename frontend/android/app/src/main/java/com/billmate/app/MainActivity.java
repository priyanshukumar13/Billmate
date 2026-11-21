package com.billmate.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BillMateExpensePlugin.class);
        super.onCreate(savedInstanceState);
        handleExpenseIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleExpenseIntent(intent);
    }

    private void handleExpenseIntent(Intent intent) {
        if (intent != null && intent.hasExtra("isBillMateExpense")) {
            BillMateExpensePlugin.Companion.setPendingExpenseFromIntent(intent);
        }
    }
}
