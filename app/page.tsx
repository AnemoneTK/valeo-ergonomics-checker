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

// ✅ เกณฑ์การตัดสิน (ปรับจูนความเซนซิทีฟได้ที่นี่)
const CONFIG = {
  MAX_NECK_LEAN_ANGLE: 25, // คอยื่นไปข้างหน้าเกิน 25 องศา
  MIN_HEAD_DROP_RATIO: 0.45, // [ใหม่] อัตราส่วนจมูก-ไหล่ ถ้าน้อยกว่า 0.45 คือก้มหน้ามองจอ
  MIN_WRIST_ANGLE: 155, // [ใหม่] ข้อมือเบี้ยวซ้าย/ขวาเกิน 25 องศา (180 - 25 = 155)
  TIME_LIMIT_SECONDS: 5, // ต้องผิดท่าต่อเนื่อง 5 วินาที
};

type PostureLevel = "good" | "warning" | "bad" | "none";

export default function ErgonomicsPro() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef<any>(null);
  const requestRef = useRef<number | null>(null);

  const [isTracking, setIsTracking] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [level, setLevel] = useState<PostureLevel>("none");
  const [duration, setDuration] = useState(0);

  // ✅ เพิ่มค่า Debug ข้อมือ และ ก้มหน้า
  const [debugInfo, setDebugInfo] = useState({
    poseType: "กำลังวิเคราะห์...",
    neckLean: 0,
    headDrop: 0,
    wristAngle: 180,
  });

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

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((mediaDevices) => {
      const videoDevices = mediaDevices.filter(
        ({ kind }) => kind === "videoinput",
      );
      setDevices(videoDevices);
    });
  }, []);

  const calculateAngle2D = (a: any, b: any, c: any) => {
    const radians =
      Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    return angle > 180.0 ? 360.0 - angle : angle;
  };

  const calculateAngle3D = (a: any, b: any, c: any) => {
    const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
    const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
    const dotProduct = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
    if (mag1 === 0 || mag2 === 0) return 180;
    let cosRatio = Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2)));
    return Math.acos(cosRatio) * (180.0 / Math.PI);
  };

  // ✅ สูตรใหม่: คำนวณองศาเฉพาะแกน X (ซ้าย/ขวา) และ Z (ความลึก) ตัดแกน Y ทิ้ง (ไม่สนใจการงอขึ้น/ลง)
  const calculateAngleXZ = (a: any, b: any, c: any) => {
    const v1 = { x: a.x - b.x, z: (a.z || 0) - (b.z || 0) };
    const v2 = { x: c.x - b.x, z: (c.z || 0) - (b.z || 0) };
    const dotProduct = v1.x * v2.x + v1.z * v2.z;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.z * v1.z);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.z * v2.z);
    if (mag1 === 0 || mag2 === 0) return 180;
    let cosRatio = Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2)));
    return Math.acos(cosRatio) * (180.0 / Math.PI);
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

      const nose = landmarks[0]; // จมูก
      const leftEar = landmarks[7];
      const rightEar = landmarks[8];
      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];
      const rightHip = landmarks[24];
      const rightKnee = landmarks[26];
      const rightAnkle = landmarks[28];

      // จุดวัดข้อมือซ้าย-ขวา
      const leftElbow = landmarks[13];
      const leftWrist = landmarks[15];
      const leftIndex = landmarks[19];
      const rightElbow = landmarks[14];
      const rightWrist = landmarks[16];
      const rightIndex = landmarks[20];

      const midEar = {
        x: (leftEar.x + rightEar.x) / 2,
        y: (leftEar.y + rightEar.y) / 2,
      };
      const midShoulder = {
        x: (leftShoulder.x + rightShoulder.x) / 2,
        y: (leftShoulder.y + rightShoulder.y) / 2,
      };

      // 1. คอยื่น
      const absoluteVertical = { x: midShoulder.x, y: midShoulder.y - 1 };
      const neckLeanAngle = calculateAngle2D(
        absoluteVertical,
        midShoulder,
        midEar,
      );

      // 2. ก้มหน้า (ระยะจมูกถึงไหล่ เทียบกับความกว้างไหล่)
      const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
      const headDropDist = midShoulder.y - nose.y; // ระยะจากไหล่ขึ้นไปหาจมูก
      const headDropRatio =
        shoulderWidth > 0.05 ? headDropDist / shoulderWidth : 1.0;

      // 3. ข้อมือเบี้ยวซ้ายขวา (คำนวณในระนาบ XZ เท่านั้น)
      const leftWristAngle =
        leftElbow.visibility > 0.5 && leftIndex.visibility > 0.5
          ? calculateAngleXZ(leftElbow, leftWrist, leftIndex)
          : 180;
      const rightWristAngle =
        rightElbow.visibility > 0.5 && rightIndex.visibility > 0.5
          ? calculateAngleXZ(rightElbow, rightWrist, rightIndex)
          : 180;

      const worstWristAngle = Math.min(leftWristAngle, rightWristAngle);

      let currentPoseType = "นั่งโต๊ะ (Desk)";
      let shouldDrawFullBody = false;
      const isLegsVisible =
        (rightKnee?.visibility || 0) > 0.6 &&
        (rightAnkle?.visibility || 0) > 0.6;

      if (isLegsVisible) {
        shouldDrawFullBody = true;
        const kneeAngle = calculateAngle3D(rightHip, rightKnee, rightAnkle);
        const hipToAnkleDistY = rightAnkle.y - rightHip.y;

        if (kneeAngle > 160) currentPoseType = "ยืน (Standing)";
        else if (kneeAngle < 130) {
          if (hipToAnkleDistY < 0.25) currentPoseType = "นั่งพื้น (Floor)";
          else currentPoseType = "ย่อตัว (Squatting)";
        } else currentPoseType = "นั่งเก้าอี้ (Chair)";
      }

      setDebugInfo({
        poseType: currentPoseType,
        neckLean: Math.round(neckLeanAngle),
        headDrop: Math.round(headDropRatio * 100) / 100, // ปัดทศนิยม 2 ตำแหน่ง
        wristAngle: Math.round(worstWristAngle),
      });

      let currentLevel: PostureLevel = "good";
      let drawColor = "#22c55e";

      // ✅ เกณฑ์ตัดสินใจว่าทำท่าผิดอยู่หรือไม่
      const isTurtleNeck = neckLeanAngle > CONFIG.MAX_NECK_LEAN_ANGLE;
      const isLookingDown = headDropRatio < CONFIG.MIN_HEAD_DROP_RATIO;
      const isWristBent = worstWristAngle < CONFIG.MIN_WRIST_ANGLE;

      const isBadPosture = isTurtleNeck || isLookingDown || isWristBent;

      if (isBadPosture) {
        if (badPostureStartTimeRef.current === null) {
          badPostureStartTimeRef.current = Date.now();
        }

        const elapsed = (Date.now() - badPostureStartTimeRef.current) / 1000;
        if (elapsed >= CONFIG.TIME_LIMIT_SECONDS) {
          currentLevel = "bad";
          drawColor = "#ef4444";
        } else {
          currentLevel = "warning";
          drawColor = "#f97316";
        }
      } else {
        // ให้พื้นที่บัฟเฟอร์เวลายืดตัวกลับ
        if (!isTurtleNeck && !isLookingDown && !isWristBent) {
          badPostureStartTimeRef.current = null;
        } else if (badPostureStartTimeRef.current !== null) {
          const elapsed = (Date.now() - badPostureStartTimeRef.current) / 1000;
          if (elapsed >= CONFIG.TIME_LIMIT_SECONDS) {
            currentLevel = "bad";
            drawColor = "#ef4444";
          } else {
            currentLevel = "warning";
            drawColor = "#f97316";
          }
        }
      }

      setLevel(currentLevel);

      const connectionsToDraw = shouldDrawFullBody
        ? POSE_CONNECTIONS
        : POSE_CONNECTIONS.filter(([start, end]) => start < 23 && end < 23);

      drawConnectors(ctx, landmarks, connectionsToDraw, {
        color: drawColor,
        lineWidth: 4,
      });
      drawLandmarks(
        ctx,
        shouldDrawFullBody ? landmarks : landmarks.slice(0, 23),
        {
          color: drawColor,
          lineWidth: 2,
          radius: 3,
        },
      );

      // วาดเส้นเล็งเพื่อตรวจจับคอยื่น/ก้มหน้า
      if (midEar && midShoulder) {
        ctx.beginPath();
        ctx.moveTo(midShoulder.x * canvas.width, midShoulder.y * canvas.height);
        ctx.lineTo(midEar.x * canvas.width, midEar.y * canvas.height);
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = 6;
        ctx.stroke();
      }
    } else {
      setLevel("none");
      badPostureStartTimeRef.current = null;
      setDebugInfo({
        poseType: "ไม่พบผู้ใช้",
        neckLean: 0,
        headDrop: 0,
        wristAngle: 180,
      });
    }
    ctx.restore();
  }, []);

  useEffect(() => {
    if (poseRef.current) return;
    let isCancelled = false;

    const pose = new Pose({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 2,
      smoothLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    pose.onResults(onResults);

    pose.initialize().then(() => {
      if (!isCancelled) poseRef.current = pose;
      else pose.close();
    });

    return () => {
      isCancelled = true;
      if (poseRef.current) {
        poseRef.current.close();
        poseRef.current = null;
      }
    };
  }, [onResults]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    let isLoopRunning = true;

    const processFrame = async () => {
      if (!isLoopRunning) return;
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
          console.warn("Skipping frame:", error);
        }
      }

      if (isTrackingRef.current && isLoopRunning) {
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
      isLoopRunning = false;
      clearInterval(interval);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isTracking, isCameraReady]);

  const handleZoom = (direction: "in" | "out") => {
    let newZoom = direction === "in" ? zoom + 0.5 : zoom - 0.5;
    newZoom = Math.max(1, Math.min(newZoom, 3));
    setZoom(newZoom);
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
              selectedDevice
                ? { deviceId: { exact: selectedDevice } }
                : { facingMode: facingMode }
            }
            onUserMedia={() => setIsCameraReady(true)}
            className="w-full h-full object-cover transition-transform duration-200"
            style={{
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
                <label className="text-xs text-gray-400">เลือกกล้อง</label>
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

        {/* ✅ จอ Debug Stats แบบจัดเต็ม */}
        {isTracking && (
          <div className="absolute top-28 left-6 flex flex-col gap-1.5 rounded-xl bg-black/60 border border-white/10 px-4 py-3 backdrop-blur-md z-20 shadow-xl pointer-events-none w-52">
            <span className="text-[10px] text-gray-400 font-mono uppercase tracking-widest border-b border-gray-600 pb-1 mb-1">
              Live Analytics
            </span>
            <div className="flex justify-between gap-2 items-center">
              <span className="text-xs text-white/80 font-medium whitespace-nowrap">
                Posture:
              </span>
              <span className="text-sm font-bold text-indigo-300 truncate">
                {debugInfo.poseType}
              </span>
            </div>
            <div className="flex justify-between gap-2 items-center">
              <span className="text-xs text-white/80 font-medium whitespace-nowrap">
                Neck Lean:
              </span>
              <span
                className={`text-sm font-bold font-mono ${debugInfo.neckLean > CONFIG.MAX_NECK_LEAN_ANGLE ? "text-red-400" : "text-green-400"}`}
              >
                {debugInfo.neckLean}°
              </span>
            </div>
            <div className="flex justify-between gap-2 items-center">
              <span className="text-xs text-white/80 font-medium whitespace-nowrap">
                Head Drop:
              </span>
              <span
                className={`text-sm font-bold font-mono ${debugInfo.headDrop < CONFIG.MIN_HEAD_DROP_RATIO ? "text-red-400" : "text-green-400"}`}
              >
                {debugInfo.headDrop}
              </span>
            </div>
            <div className="flex justify-between gap-2 items-center">
              <span className="text-xs text-white/80 font-medium whitespace-nowrap">
                Wrist (L/R):
              </span>
              <span
                className={`text-sm font-bold font-mono ${debugInfo.wristAngle < CONFIG.MIN_WRIST_ANGLE ? "text-red-400" : "text-green-400"}`}
              >
                {debugInfo.wristAngle}°
              </span>
            </div>
          </div>
        )}

        {isTracking && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 flex items-center gap-4 rounded-full bg-black/60 border border-white/10 px-5 py-2.5 backdrop-blur-md z-20 shadow-2xl animate-in fade-in zoom-in duration-300">
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
              setFacingMode((prev) =>
                prev === "user" ? "environment" : "user",
              );
              setSelectedDevice("");
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 border border-white/10 text-white backdrop-blur-md transition-all active:scale-95 hover:bg-black/70"
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
              className={`flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all active:scale-90 shadow-lg ${isTracking ? "border-red-500 bg-red-500/20 text-red-500" : "border-white/50 bg-white/10 text-white hover:bg-white/20"}`}
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
