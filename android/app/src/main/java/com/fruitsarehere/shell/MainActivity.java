package com.fruitsarehere.shell;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

/**
 * 纯 WebView 壳：加载打包进 assets 的 H5，业务代码全部在 www/ 里。
 *
 * 两个产品风味（productFlavors）共用这一个 Activity：
 *   customer  → app/src/customer/assets/www/   （客户端）
 *   merchant  → app/src/merchant/assets/www/   （商户端）
 */
public class MainActivity extends Activity {

    private static final String ENTRY = "file:///android_asset/www/index.html";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 允许 Chrome 远程调试（chrome://inspect），debug 包才开启
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        // 登录令牌存在 localStorage，必须开启 DOM Storage，否则登录态无法保持
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        // 本地 assets 页面要直接访问局域网后端：放开 file:// 的同源限制
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null || "file".equals(uri.getScheme())) {
                    return false;   // 本地资源自己处理
                }
                // 外链交给系统浏览器，避免把外部网页开在 APP 里
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // 没有可处理的 App 时忽略
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showLoadFailed(error.getDescription());
                }
            }
        });

        setContentView(webView);
        webView.loadUrl(buildEntryUrl());
    }

    /** 把编译期配置的后端地址通过 ?api= 传给前端，前端会写入 localStorage 长期记住 */
    private String buildEntryUrl() {
        String apiBase = BuildConfig.API_BASE == null ? "" : BuildConfig.API_BASE.trim();
        if (apiBase.isEmpty()) {
            return ENTRY;
        }
        return ENTRY + "?api=" + Uri.encode(apiBase);
    }

    /** assets 未导出或资源缺失时给出可读提示，避免白屏 */
    private void showLoadFailed(CharSequence reason) {
        TextView tip = new TextView(this);
        tip.setText(getString(R.string.web_load_failed) + "\n\n" + reason);
        tip.setTextSize(16f);
        tip.setTextColor(Color.parseColor("#1E241F"));
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        tip.setPadding(pad * 2, pad * 6, pad * 2, pad * 2);
        setContentView(tip);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // H5 使用 hash 路由，后退键优先在应用内回退页面
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) {
                parent.removeView(webView);
            }
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
