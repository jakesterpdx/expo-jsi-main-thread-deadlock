import * as Crypto from "expo-crypto";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import ReservedRegionsView from "./ReservedRegionsViewNativeComponent";

// ReservedRegionsView dispatches its FIRST regionsChange through
// EventEmitter::experimental_flushSync, so React Native runs this handler
// synchronously on the main thread (EventBeat::induce ->
// RuntimeScheduler_Modern::executeNowOnTheSameThread).
//
// The handler starts Expo async calls, waits until their resolutions are
// queued in React Native's scheduler, then throws from a microtask. The throw
// makes handleTaskError -> clearQueues() drop the queued resolutions on the
// main thread under schedulingMutex_; each JavaScriptPromise.deinit reaches
// scheduleRelease, which is not on the JS thread, schedules directly, and
// locks schedulingMutex_ again. The app freezes instead of reporting the error.
function trigger() {
  for (let i = 0; i < 50; i++) {
    void Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `value ${i}`).catch(() => {});
  }
  const until = Date.now() + 300;
  while (Date.now() < until) {
    // Busy-wait so the native resolutions land in the task queue.
  }
  queueMicrotask(() => {
    throw new Error("thrown from a microtask");
  });
}

export default function App() {
  const [count, setCount] = useState(0);
  const fired = useRef(false);
  return (
    <ReservedRegionsView
      style={styles.container}
      onRegionsChange={() => {
        if (fired.current) return;
        fired.current = true;
        trigger();
      }}
    >
      <Text style={styles.text}>Ticks: {count}</Text>
      <Pressable style={styles.button} onPress={() => setCount((c) => c + 1)}>
        <Text style={styles.label}>Tick (still responsive?)</Text>
      </Pressable>
    </ReservedRegionsView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  text: { fontSize: 20 },
  button: { backgroundColor: "#333", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  label: { color: "#fff", fontSize: 16 },
});
