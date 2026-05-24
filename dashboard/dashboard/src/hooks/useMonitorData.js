import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchNodes, fetchSensors, fetchAnomalies, fetchHeartbeats,
  getMockNodes, getMockSensors, getMockAnomalies, getMockHeartbeats,
} from '../utils/api';

const POLL_INTERVAL = 3000; // 3 seconds

export default function useMonitorData() {
  const [nodes, setNodes]           = useState({});
  const [sensorData, setSensorData] = useState([]);
  const [anomalies, setAnomalies]   = useState([]);
  const [heartbeats, setHeartbeats] = useState({});
  const [connected, setConnected]   = useState(false);
  const [demoMode, setDemoMode]     = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading]       = useState(true);
  const intervalRef = useRef(null);

  const pollMock = useCallback(() => {
    setNodes(getMockNodes());
    setSensorData(getMockSensors(selectedNode));
    setAnomalies(getMockAnomalies());
    setHeartbeats(getMockHeartbeats());
    setLoading(false);
  }, [selectedNode]);

  const pollReal = useCallback(async () => {
    try {
      const [n, s, a, h] = await Promise.all([
        fetchNodes(),
        fetchSensors(selectedNode, 200),
        fetchAnomalies(selectedNode, 100),
        fetchHeartbeats(),
      ]);
      setNodes(n);
      setSensorData(s);
      setAnomalies(a);
      setHeartbeats(h);
      setConnected(true);
      setDemoMode(false);
      setLoading(false);
    } catch {
      // Backend unreachable → switch to demo
      setDemoMode(true);
      setConnected(false);
      pollMock();
    }
  }, [selectedNode, pollMock]);

  useEffect(() => {
    // Initial fetch
    pollReal();

    // Poll loop
    intervalRef.current = setInterval(() => {
      if (demoMode) {
        pollMock();
      } else {
        pollReal();
      }
    }, POLL_INTERVAL);

    return () => clearInterval(intervalRef.current);
  }, [demoMode, pollReal, pollMock]);

  return {
    nodes,
    sensorData,
    anomalies,
    heartbeats,
    connected,
    demoMode,
    loading,
    selectedNode,
    setSelectedNode,
  };
}
