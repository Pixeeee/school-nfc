import { useCallback, useEffect, useState } from "react";
import { SchoolNfc } from "../native/plugin";
import type {
  CardWriteState,
  DeviceState,
  QueueSummary,
  ScanResult,
} from "../native/types";
export function useNativeState() {
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [queue, setQueue] = useState<QueueSummary | null>(null);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [write, setWrite] = useState<CardWriteState>({ phase: "IDLE" });
  const refreshDevice = useCallback(async () => {
    setDevice(await SchoolNfc.getDeviceState());
  }, []);
  useEffect(() => {
    void refreshDevice();
    void SchoolNfc.getQueueSummary().then(setQueue);
    const timer = setInterval(() => {
      void SchoolNfc.getQueueSummary()
        .then(setQueue)
        .catch(() => {});
    }, 5000);
    const handles = Promise.all([
      SchoolNfc.addListener("deviceStateChanged", setDevice),
      SchoolNfc.addListener("queueStateChanged", setQueue),
      SchoolNfc.addListener("scanResult", setLastScan),
      SchoolNfc.addListener("cardWriteStateChanged", setWrite),
    ]);
    return () => {
      clearInterval(timer);
      void handles.then((h) => h.forEach((x) => void x.remove()));
    };
  }, [refreshDevice]);
  return { device, queue, lastScan, setLastScan, write, refreshDevice };
}
