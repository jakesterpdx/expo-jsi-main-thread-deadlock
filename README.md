# expo-modules-jsi: deadlock when a JS error clears React Native's queue on the main thread

Minimal reproduction for an iOS freeze in `expo-modules-jsi` 58.0.23 (Expo SDK 58, React Native 0.88.1, New Architecture, Hermes). The fix for expo/expo#51851 (#51880) defers a `JavaScriptPromise` / `JavaScriptCallback` release only on the JavaScript thread. React Native also runs JavaScript **synchronously on the main thread** when a native view dispatches an event through `EventEmitter::experimental_flushSync`. If a microtask throws there, `RuntimeScheduler_Modern::clearQueues()` destroys the queued tasks on the main thread while holding `schedulingMutex_`, a queued Expo promise's `deinit` calls `scheduleRelease`, which is not on the JS thread and so schedules directly, and `scheduleTask` locks `schedulingMutex_` again. The app freezes instead of reporting the error.

## Run it

```sh
npm install
npx expo run:ios --configuration Release
```

The app freezes at launch: the "Tick" button never responds. `sample <pid>` shows the main thread in:

```
EventBeat::induce
RuntimeScheduler_Modern::executeNowOnTheSameThread
RuntimeScheduler_Modern::handleTaskError
RuntimeScheduler_Modern::clearQueues
JavaScriptPromise.deinit                 JavaScriptPromise.swift:71
JavaScriptRuntime.Scheduler.scheduleRelease(_:)
std::__shared_mutex_base::lock()
```

Reproduced 4 of 4 launches on an iOS 27 simulator (iPhone 17 Pro), Xcode 27.

## What it does

- `App.tsx` renders `ReservedRegionsView` from `react-native-reserved-regions` 0.2.0, chosen only because it dispatches its first event with `experimental_flushSync` (React Native's own `VirtualView` uses the same API). `ReservedRegionsViewNativeComponent.ts` is that library's component spec, copied because the package does not export the component.
- The first `onRegionsChange` handler, running synchronously on the main thread, starts 50 `expo-crypto` `digestStringAsync` calls, busy-waits 300 ms so their resolutions are queued in React Native's scheduler, and throws from `queueMicrotask`.

## The fix we verified

In `apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntimeScheduler.swift`, defer the release on every thread:

```diff
-      guard supportsAsyncScheduling && isOnJavaScriptThread() else {
+      guard supportsAsyncScheduling else {
```

With that change, the same app reports `Error: thrown from a microtask` as an unhandled JS exception and exits, 3 of 3 launches.
