"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Webcam from "react-webcam";
import {
  Camera,
  Play,
  Square,
  Activity,
  FlipHorizontal,
  ZoomIn,
  ZoomOut,
  Settings,
} from "lucide-react";

// --- สับขาหลอก Turbopack ของ Next.js ---
import type { Results, Landmark } from "@mediapipe/pose";
const mpPose = require("@mediapipe/pose");
const mpDrawing = require("@mediapipe/drawing_utils");
const Pose =
  mpPose.Pose ||
  (typeof window !== "undefined" ? (window as any).Pose : undefined);
const POSE_CONNECTIONS =
  mpPose.POSE_CONNECTIONS ||
  (typeof window !== "undefined"
    ? (window as any).POSE_CONNECTIONS
    : undefined);
const drawConnectors =
  mpDrawing.drawConnectors ||
  (typeof window !== "undefined" ? (window as any).drawConnectors : undefined);
const drawLandmarks =
  mpDrawing.drawLandmarks ||
  (typeof window !== "undefined" ? (window as any).drawLandmarks : undefined);

const CONFIG = {
  SITTING_GOOD_ANGLE: 150,
  TIME_LIMIT_SECONDS: 5,
};

type PostureLevel = "good" | "warning" | "bad" | "none";

export default function ErgonomicsPro() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef<any>(null);
  const requestRef = useRef<number>();

  const [isTracking, setIsTracking] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [level, setLevel] = useState<PostureLevel>("none");
  const [duration, setDuration] = useState(0);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [zoom, setZoom] = useState(1);
  const [showSettings, setShowSettings] = useState(false);

  const isTrackingRef = useRef(isTracking);
  const badPostureStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

  // --- 📷 โหลดกล้องทั้งหมด (แก้การล็อกเลนส์) ---
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((mediaDevices) => {
      const videoDevices = mediaDevices.filter(
        ({ kind }) => kind === "videoinput",
      );
      setDevices(videoDevices);
      // ✅ ลบการตั้งค่า selectedDevice อัตโนมัติออกไป ปล่อยให้ระบบใช้ facingMode สลับหน้า/หลังเป็นค่าเริ่มต้น
    });
  }, []);

  const calculateAngle = (a: Landmark, b: Landmark, c: Landmark) => {
    const radians =
      Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    return angle > 180.0 ? 360.0 - angle : angle;
  };

  const onResults = useCallback((results: Results) => {
    if (!canvasRef.current || !webcamRef.current?.video) return;
    const video = webcamRef.current.video;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks && isTrackingRef.current) {
      const landmarks = results.poseLandmarks;
      const rightEar = landmarks[8];
      const rightShoulder = landmarks[12];
      const rightHip = landmarks[24];
      const rightKnee = landmarks[26];
      const rightWrist = landmarks[16];

      let currentLevel: PostureLevel = "good";
      let drawColor = "#22c55e";

      if (rightWrist.y > rightKnee.y - 0.1) {
        const kneeAngle = calculateAngle(rightHip, rightKnee, landmarks[28]);
        if (kneeAngle > 160) {
          currentLevel = "bad";
          drawColor = "#ef4444";
        }
      } else {
        const backAngle = calculateAngle(rightEar, rightShoulder, rightHip);
        if (backAngle < CONFIG.SITTING_GOOD_ANGLE) {
          if (badPostureStartTimeRef.current === null)
            badPostureStartTimeRef.current = Date.now();
          const elapsed = (Date.now() - badPostureStartTimeRef.current) / 1000;

          if (elapsed >= CONFIG.TIME_LIMIT_SECONDS) {
            currentLevel = "bad";
            drawColor = "#ef4444";
          } else {
            currentLevel = "warning";
            drawColor = "#f97316";
          }
        } else {
          badPostureStartTimeRef.current = null;
        }
      }

      setLevel(currentLevel);
      drawConnectors(ctx, landmarks, POSE_CONNECTIONS, {
        color: drawColor,
        lineWidth: 4,
      });
      drawLandmarks(ctx, landmarks, {
        color: drawColor,
        lineWidth: 2,
        radius: 3,
      });
    } else {
      setLevel("none");
      badPostureStartTimeRef.current = null;
    }
    ctx.restore();
  }, []);

  useEffect(() => {
    if (poseRef.current) return;
    const pose = new Pose({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    pose.onResults(onResults);
    poseRef.current = pose;
  }, [onResults]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const processFrame = async () => {
      const video = webcamRef.current?.video;
      if (
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        poseRef.current &&
        isCameraReady
      ) {
        try {
          await poseRef.current.send({ image: video });
        } catch (error) {
          console.error("AI Error:", error);
        }
      }
      if (isTrackingRef.current) {
        requestRef.current = requestAnimationFrame(processFrame);
      }
    };

    if (isTracking && isCameraReady) {
      interval = setInterval(() => setDuration((prev) => prev + 1), 1000);
      requestRef.current = requestAnimationFrame(processFrame);
    } else {
      setDuration(0);
      setLevel("none");
      badPostureStartTimeRef.current = null;
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }

    return () => {
      clearInterval(interval);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isTracking, isCameraReady]);

  const handleZoom = (direction: "in" | "out") => {
    let newZoom = direction === "in" ? zoom + 0.5 : zoom - 0.5;
    newZoom = Math.max(1, Math.min(newZoom, 3));
    setZoom(newZoom);

    const stream = webcamRef.current?.video?.srcObject as MediaStream;
    if (stream) {
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as any;
      if (capabilities?.zoom) {
        track
          .applyConstraints({ advanced: [{ zoom: newZoom }] })
          .catch(() => {});
      }
    }
  };

  const captureImage = () => {
    if (!webcamRef.current?.video || !canvasRef.current) return;
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = webcamRef.current.video.videoWidth;
    captureCanvas.height = webcamRef.current.video.videoHeight;
    const ctx = captureCanvas.getContext("2d");
    if (ctx) {
      ctx.translate(captureCanvas.width / 2, captureCanvas.height / 2);
      ctx.scale(zoom, zoom);

      if (facingMode === "user") ctx.scale(-1, 1);

      ctx.translate(-captureCanvas.width / 2, -captureCanvas.height / 2);
      ctx.drawImage(
        webcamRef.current.video,
        0,
        0,
        captureCanvas.width,
        captureCanvas.height,
      );

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (isTracking)
        ctx.drawImage(
          canvasRef.current,
          0,
          0,
          captureCanvas.width,
          captureCanvas.height,
        );

      const link = document.createElement("a");
      link.href = captureCanvas.toDataURL("image/jpeg", 0.9);
      link.download = `ergonomics-${new Date().getTime()}.jpg`;
      link.click();
    }
  };

  const formatTime = (secs: number) =>
    `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;

  const statusConfig = {
    none: { text: "Standby", color: "text-gray-400", dot: "bg-gray-500" },
    good: {
      text: "Good Posture",
      color: "text-green-400",
      dot: "bg-green-500",
    },
    warning: {
      text: "Adjusting...",
      color: "text-orange-400",
      dot: "bg-orange-500",
    },
    bad: {
      text: "Poor Posture!",
      color: "text-red-400",
      dot: "bg-red-500 animate-pulse",
    },
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col font-sans overflow-hidden">
      <div className="relative h-full w-full">
        <div className="absolute inset-0 w-full h-full overflow-hidden transition-transform duration-300">
          <Webcam
            ref={webcamRef}
            videoConstraints={
              // ✅ ลอจิกการเลือกกล้องที่ถูกต้อง
              selectedDevice
                ? { deviceId: { exact: selectedDevice } } // ถ้าผู้ใช้เลือกเจาะจง ให้ใช้ตัวนั้น
                : { facingMode: facingMode } // ถ้าไม่ได้เลือกเจาะจง ให้เบราว์เซอร์สลับกล้องหน้า/หลังให้
            }
            onUserMedia={() => setIsCameraReady(true)}
            className="w-full h-full object-cover transition-transform duration-200"
            style={{
              // ✅ การทำกระจกเงา (Mirror) จะทำเฉพาะกล้องหน้า เพื่อให้ขยับตัวได้เป็นธรรมชาติ
              transform: `scale(${zoom}) ${facingMode === "user" ? "scaleX(-1)" : "scaleX(1)"}`,
            }}
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none z-10"
            style={{
              transform: `scale(${zoom}) ${facingMode === "user" ? "scaleX(-1)" : "scaleX(1)"}`,
            }}
          />
        </div>

        <div className="absolute top-0 left-0 right-0 p-6 z-20 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/10 shadow-lg">
                <Activity className="h-5 w-5 text-indigo-400" />
              </div>
              <span className="text-lg font-bold text-white tracking-wide">
                PostureGuard Pro
              </span>
            </div>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>

          {showSettings && (
            <div className="mt-4 p-4 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 flex flex-col gap-3 animate-in fade-in slide-in-from-top-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">
                  เลือกกล้อง (หากต้องการเจาะจง)
                </label>
                <select
                  className="bg-gray-800 text-white text-sm rounded-lg p-2 border border-gray-700 outline-none"
                  value={selectedDevice}
                  onChange={(e) => {
                    setSelectedDevice(e.target.value);
                    setFacingMode("environment");
                  }}
                >
                  <option value="">- ปล่อยให้ระบบเลือกอัตโนมัติ -</option>
                  {devices.map((device, key) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${key + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {isTracking && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 flex items-center gap-4 rounded-full bg-black/60 border border-white/10 px-5 py-2.5 backdrop-blur-md z-20 shadow-2xl">
            <div className="flex items-center gap-2 border-r border-white/20 pr-4">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${statusConfig[level].dot}`}
                />
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${statusConfig[level].dot}`}
                />
              </span>
              <span className="text-sm font-semibold text-white/90">
                {formatTime(duration)}
              </span>
            </div>
            <div
              className={`text-sm font-bold tracking-wide ${statusConfig[level].color}`}
            >
              {statusConfig[level].text}
            </div>
          </div>
        )}

        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
          <button
            onClick={() => {
              // ✅ สลับคำสั่งเรียกกล้องหน้า/หลัง และ "ล้างค่าเลนส์ที่ถูกล็อก" เสมอ
              setFacingMode((prev) =>
                prev === "user" ? "environment" : "user",
              );
              setSelectedDevice("");
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 border border-white/10 text-white backdrop-blur-md transition-all active:scale-95 hover:bg-black/70"
            title="สลับกล้องหน้า/หลัง"
          >
            <FlipHorizontal className="h-5 w-5" />
          </button>

          <div className="flex flex-col gap-1 items-center bg-black/50 border border-white/10 rounded-full py-2 backdrop-blur-md">
            <button
              onClick={() => handleZoom("in")}
              disabled={zoom >= 3}
              className="p-2 text-white disabled:opacity-30 hover:scale-110 active:scale-90 transition-transform"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
            <span className="text-xs font-bold text-white/80 my-1">
              {zoom.toFixed(1)}x
            </span>
            <button
              onClick={() => handleZoom("out")}
              disabled={zoom <= 1}
              className="p-2 text-white disabled:opacity-30 hover:scale-110 active:scale-90 transition-transform"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-32 pb-12 px-8 z-20">
          <div className="flex items-center justify-center gap-12">
            <button
              onClick={() => setIsTracking(!isTracking)}
              className={`flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all active:scale-90 shadow-lg ${
                isTracking
                  ? "border-red-500 bg-red-500/20 text-red-500"
                  : "border-white/50 bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {isTracking ? (
                <Square className="h-6 w-6 fill-current" />
              ) : (
                <Play className="h-7 w-7 ml-1 fill-current" />
              )}
            </button>

            <button
              onClick={captureImage}
              className="group relative flex h-24 w-24 items-center justify-center active:scale-95 transition-transform"
            >
              <span className="absolute inset-0 rounded-full border-4 border-white/80 group-hover:scale-105 transition-transform" />
              <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white group-active:scale-95 transition-transform shadow-2xl">
                <Camera className="h-8 w-8 text-gray-900" />
              </span>
            </button>
            <div className="h-16 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}
