// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.1"),
        .package(name: "CapacitorFirebaseAnalytics", path: "../../../node_modules/@capacitor-firebase/analytics"),
        .package(name: "CapacitorFirebaseAuthentication", path: "../../../node_modules/@capacitor-firebase/authentication"),
        .package(name: "CapacitorFirebaseCrashlytics", path: "../../../node_modules/@capacitor-firebase/crashlytics"),
        .package(name: "CapacitorFirebaseAppCheck", path: "../../../node_modules/@capacitor-firebase/app-check"),
        .package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),
        .package(name: "CapacitorLocalNotifications", path: "../../../node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorPushNotifications", path: "../../../node_modules/@capacitor/push-notifications"),
        .package(name: "CapacitorSplashScreen", path: "../../../node_modules/@capacitor/splash-screen"),
        .package(name: "CapacitorStatusBar", path: "../../../node_modules/@capacitor/status-bar")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorFirebaseAnalytics", package: "CapacitorFirebaseAnalytics"),
                .product(name: "CapacitorFirebaseAuthentication", package: "CapacitorFirebaseAuthentication"),
                .product(name: "CapacitorFirebaseCrashlytics", package: "CapacitorFirebaseCrashlytics"),
                .product(name: "CapacitorFirebaseAppCheck", package: "CapacitorFirebaseAppCheck"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar")
            ]
        )
    ]
)
