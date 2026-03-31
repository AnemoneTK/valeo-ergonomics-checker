"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Webcam from "react-webcam";
import {
  Camera,
  Activity,
  FlipHorizontal,
  ZoomIn,
  ZoomOut,
  Settings,
  BarChart2,
  Scan,
  ArrowLeft,
} from "lucide-react";
import {
  usePostureTracker,
  PostureLevel,
  SegmentColors,
} from "../../hooks/usePostureTracker";

const MP_POSE = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

type ToastInfo = { msg: string; type: "success" | "info" | "warning" } | null;

export default function ErgonomicsPro() {
  const {
    webcamRef,
    canvasRef,
    isTracking,
    setIsTracking,
    setIsCameraReady,
    level,
    duration,
    debugInfo,
    calibrate,
    isCalibrated,
    segmentColors,
    autoCalibrateEvent,
    calibrateRejectEvent,
  } = usePostureTracker();

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [zoom, setZoom] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const [toast, setToast] = useState<ToastInfo>(null);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((mediaDevices) => {
        setDevices(mediaDevices.filter(({ kind }) => kind === "videoinput"));
      });
    } else {
      console.warn("เบราว์เซอร์นี้ไม่รองรับ enumerateDevices");
    }
  }, []);

  useEffect(() => {
    if (autoCalibrateEvent > 0) {
      setToast({ msg: "🔄 ระบบปรับท่ามาตรฐานให้อัตโนมัติ!", type: "info" });
      setTimeout(() => setToast(null), 3000);
    }
  }, [autoCalibrateEvent]);

  useEffect(() => {
    if (calibrateRejectEvent > 0) {
      setToast({
        msg: "⚠️ กรุณานั่งหลังตรง ระบบรอปรับท่าใหม่อยู่...",
        type: "warning",
      });
      setTimeout(() => setToast(null), 3000);
    }
  }, [calibrateRejectEvent]);

  const handleZoom = (direction: "in" | "out") => {
    let newZoom = direction === "in" ? zoom + 0.5 : zoom - 0.5;
    setZoom(Math.max(1, Math.min(newZoom, 3)));
  };

  const handleCalibrate = () => {
    calibrate();
    setToast({ msg: "✨ บันทึกท่ามาตรฐานเรียบร้อยแล้ว", type: "success" });
    setTimeout(() => setToast(null), 3000);
  };

  const captureImage = () => {
    if (!webcamRef.current?.video || !canvasRef.current) return;
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = webcamRef.current.video.videoWidth;
    captureCanvas.height = webcamRef.current.video.videoHeight;
    const ctx = captureCanvas.getContext("2d");
    if (ctx) {
      ctx.save();
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
      ctx.restore();

      if (
        isTracking &&
        debugInfo?.landmarks &&
        debugInfo.landmarks.length > 0
      ) {
        const landmarks = debugInfo.landmarks;
        const colors = segmentColors;
        const width = captureCanvas.width;
        const height = captureCanvas.height;

        const drawLineOnCapture = (
          startIdx: number,
          endIdx: number,
          color: string,
          lineWidth = 4,
          minVisibility = 0.5,
        ) => {
          const start = landmarks[startIdx];
          const end = landmarks[endIdx];
          // ✅ แก้บัค Vercel: ดักจับกรณี visibility เป็น undefined
          if (
            !start ||
            !end ||
            (start.visibility || 0) < minVisibility ||
            (end.visibility || 0) < minVisibility
          )
            return;

          let startX = start.x;
          let endX = end.x;
          if (facingMode === "user") {
            startX = 1 - startX;
            endX = 1 - endX;
          }

          ctx.beginPath();
          ctx.moveTo(startX * width, start.y * height);
          ctx.lineTo(endX * width, end.y * height);
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.stroke();
        };

        const getWeightedMidpoint = (idx1: number, idx2: number) => {
          const p1 = landmarks[idx1];
          const p2 = landmarks[idx2];
          const v1 = p1.visibility || 0.01;
          const v2 = p2.visibility || 0.01;
          return {
            x: (p1.x * v1 + p2.x * v2) / (v1 + v2),
            y: (p1.y * v1 + p2.y * v2) / (v1 + v2),
          };
        };

        let cEar = getWeightedMidpoint(MP_POSE.LEFT_EAR, MP_POSE.RIGHT_EAR);
        let cMidShoulder = getWeightedMidpoint(
          MP_POSE.LEFT_SHOULDER,
          MP_POSE.RIGHT_SHOULDER,
        );
        let cMidHip = getWeightedMidpoint(MP_POSE.LEFT_HIP, MP_POSE.RIGHT_HIP);

        if (facingMode === "user") {
          cEar = { x: 1 - cEar.x, y: cEar.y };
          cMidShoulder = { x: 1 - cMidShoulder.x, y: cMidShoulder.y };
          cMidHip = { x: 1 - cMidHip.x, y: cMidHip.y };
        }

        ctx.beginPath();
        ctx.moveTo(cEar.x * width, cEar.y * height);
        ctx.lineTo(cMidShoulder.x * width, cMidShoulder.y * height);
        ctx.lineTo(cMidHip.x * width, cMidHip.y * height);
        ctx.strokeStyle = colors.neck;
        ctx.lineWidth = 6;
        ctx.stroke();

        drawLineOnCapture(11, 12, colors.shoulders, 4);

        drawLineOnCapture(11, 23, colors.torso);
        drawLineOnCapture(12, 24, colors.torso);
        drawLineOnCapture(23, 24, colors.torso);

        drawLineOnCapture(12, 14, colors.rightArm);
        drawLineOnCapture(14, 16, colors.rightArm);
        drawLineOnCapture(16, 20, colors.rightWrist, 6);
        drawLineOnCapture(16, 18, colors.rightWrist, 4);
        drawLineOnCapture(16, 22, colors.rightWrist, 4);

        drawLineOnCapture(11, 13, colors.leftArm);
        drawLineOnCapture(13, 15, colors.leftArm);
        drawLineOnCapture(15, 19, colors.leftWrist, 6);
        drawLineOnCapture(15, 17, colors.leftWrist, 4);
        drawLineOnCapture(15, 21, colors.leftWrist, 4);

        drawLineOnCapture(24, 26, colors.rightLeg, 4, 0.65);
        drawLineOnCapture(26, 28, colors.rightLeg, 4, 0.65);
        drawLineOnCapture(23, 25, colors.leftLeg, 4, 0.65);
        drawLineOnCapture(25, 27, colors.leftLeg, 4, 0.65);
      }

      captureCanvas.toBlob(
        async (blob) => {
          if (!blob) return;
          if (navigator.share && navigator.canShare) {
            const file = new File([blob], `ergonomics-${Date.now()}.jpg`, {
              type: "image/jpeg",
            });
            if (navigator.canShare({ files: [file] })) {
              try {
                await navigator.share({
                  files: [file],
                  title: "Posture Snapshot",
                });
                return;
              } catch (err) {}
            }
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `ergonomics-${Date.now()}.jpg`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        },
        "image/jpeg",
        0.9,
      );
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

  useEffect(() => {
    if (
      !canvasRef.current ||
      !webcamRef.current?.video ||
      !debugInfo?.landmarks
    )
      return;
    const video = webcamRef.current.video;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (video.videoWidth > 0 && video.videoHeight > 0) {
      if (
        canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight
      ) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isTracking && debugInfo.landmarks.length > 0) {
      const landmarks = debugInfo.landmarks;
      const colors = segmentColors;
      const width = canvas.width;
      const height = canvas.height;

      const drawLineOnLive = (
        startIdx: number,
        endIdx: number,
        color: string,
        lineWidth = 4,
        minVisibility = 0.5,
      ) => {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];
        // ✅ แก้บัค Vercel: ดักจับกรณี visibility เป็น undefined
        if (
          !start ||
          !end ||
          (start.visibility || 0) < minVisibility ||
          (end.visibility || 0) < minVisibility
        )
          return;

        ctx.beginPath();
        ctx.moveTo(start.x * width, start.y * height);
        ctx.lineTo(end.x * width, end.y * height);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      };

      const getWeightedMidpoint = (idx1: number, idx2: number) => {
        const p1 = landmarks[idx1];
        const p2 = landmarks[idx2];
        const v1 = p1.visibility || 0.01;
        const v2 = p2.visibility || 0.01;
        return {
          x: (p1.x * v1 + p2.x * v2) / (v1 + v2),
          y: (p1.y * v1 + p2.y * v2) / (v1 + v2),
        };
      };

      const midEarLive = getWeightedMidpoint(
        MP_POSE.LEFT_EAR,
        MP_POSE.RIGHT_EAR,
      );
      const midShoulderLive = getWeightedMidpoint(
        MP_POSE.LEFT_SHOULDER,
        MP_POSE.RIGHT_SHOULDER,
      );
      const midHipLive = getWeightedMidpoint(
        MP_POSE.LEFT_HIP,
        MP_POSE.RIGHT_HIP,
      );

      ctx.beginPath();
      ctx.moveTo(midEarLive.x * width, midEarLive.y * height);
      ctx.lineTo(midShoulderLive.x * width, midShoulderLive.y * height);
      ctx.lineTo(midHipLive.x * width, midHipLive.y * height);
      ctx.strokeStyle = colors.neck;
      ctx.lineWidth = 6;
      ctx.stroke();

      drawLineOnLive(11, 12, colors.shoulders, 4);

      drawLineOnLive(11, 23, colors.torso);
      drawLineOnLive(12, 24, colors.torso);
      drawLineOnLive(23, 24, colors.torso);

      drawLineOnLive(12, 14, colors.rightArm);
      drawLineOnLive(14, 16, colors.rightArm);
      drawLineOnLive(16, 20, colors.rightWrist, 6);
      drawLineOnLive(16, 18, colors.rightWrist, 4);
      drawLineOnLive(16, 22, colors.rightWrist, 4);

      drawLineOnLive(11, 13, colors.leftArm);
      drawLineOnLive(13, 15, colors.leftArm);
      drawLineOnLive(15, 19, colors.leftWrist, 6);
      drawLineOnLive(15, 17, colors.leftWrist, 4);
      drawLineOnLive(15, 21, colors.leftWrist, 4);

      drawLineOnLive(24, 26, colors.rightLeg, 4, 0.65);
      drawLineOnLive(26, 28, colors.rightLeg, 4, 0.65);
      drawLineOnLive(23, 25, colors.leftLeg, 4, 0.65);
      drawLineOnLive(25, 27, colors.leftLeg, 4, 0.65);
    }
  }, [
    debugInfo?.landmarks,
    isTracking,
    level,
    segmentColors,
    debugInfo?.poseType,
  ]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col font-sans overflow-hidden">
      {toast && (
        <div
          className={`absolute top-24 left-1/2 -translate-x-1/2 px-6 py-3 text-white text-sm font-bold rounded-full shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-4 z-50 whitespace-nowrap 
          ${toast.type === "success" ? "bg-green-500/90" : toast.type === "warning" ? "bg-orange-500/90" : "bg-indigo-500/90"}`}
        >
          {toast.msg}
        </div>
      )}

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

        <div className="absolute top-0 left-0 right-0 p-6 z-30 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* 🌟 เปลี่ยนจาก <Link> เป็น <a> ธรรมดา เพื่อบังคับให้เบราว์เซอร์ตัดจบการทำงานของ AI ทันที */}
              {/* 🌟 ใช้ button + window.location.href หลบกฎ Next.js แต่ได้ผลลัพธ์ตัดจบ AI เหมือนเดิม! */}
              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                className="relative z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 border border-white/10 text-white backdrop-blur-md hover:bg-white/20 transition-all cursor-pointer"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/10 shadow-lg">
                <Activity className="h-5 w-5 text-indigo-400" />
              </div>
              <span className="text-lg font-bold text-white tracking-wide">
                PostureGuard Pro
              </span>
            </div>

            {/* ... โค้ดปุ่มฝั่งขวาเดิม (Analytics, Settings) ... */}

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className={`p-2 rounded-full backdrop-blur-sm transition-colors ${showAnalytics ? "bg-indigo-500 text-white" : "bg-white/10 text-white hover:bg-white/20"}`}
              >
                <BarChart2 className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
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

        {isTracking && showAnalytics && (
          <div className="absolute top-28 left-6 flex flex-col gap-1.5 rounded-xl bg-black/60 border border-white/10 px-4 py-3 backdrop-blur-md z-20 shadow-xl pointer-events-none w-56 animate-in fade-in slide-in-from-left-4">
            <span className="text-[10px] text-gray-400 font-mono uppercase tracking-widest border-b border-gray-600 pb-1 mb-1">
              Live Analytics
            </span>
            <div className="flex justify-between gap-2 items-center">
              <span className="text-xs text-white/80 font-medium whitespace-nowrap">
                Posture:
              </span>
              <span className="text-sm font-bold text-indigo-300 truncate">
                {debugInfo?.poseType}
              </span>
            </div>
            <div className="flex justify-between gap-2 items-center">
              <span className="text-xs text-white/80 font-medium whitespace-nowrap">
                Neck Lean:
              </span>
              <span
                className={`text-sm font-bold font-mono ${segmentColors?.neck === "#ef4444" ? "text-red-400" : "text-green-400"}`}
              >
                {debugInfo?.neckLean}°
              </span>
            </div>
            <div className="flex justify-between gap-2 items-center">
              <span className="text-xs text-white/80 font-medium whitespace-nowrap">
                Shoulder Hunch:
              </span>
              <span
                className={`text-sm font-bold font-mono ${segmentColors?.shoulders === "#ef4444" ? "text-red-400" : "text-green-400"}`}
              >
                {debugInfo?.shoulderHunch}%
              </span>
            </div>
            <div className="flex justify-between gap-2 items-center">
              <span className="text-xs text-white/80 font-medium whitespace-nowrap">
                Wrist (L/R):
              </span>
              <span
                className={`text-sm font-bold font-mono ${segmentColors?.leftWrist === "#ef4444" || segmentColors?.rightWrist === "#ef4444" ? "text-red-400" : "text-green-400"}`}
              >
                {debugInfo?.wristAngle}°
              </span>
            </div>
          </div>
        )}

        {isTracking && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20">
            <div className="flex items-center gap-4 rounded-full bg-black/60 border border-white/10 px-5 py-2.5 backdrop-blur-md shadow-2xl animate-in fade-in zoom-in duration-300">
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
            className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 border border-white/10 text-white backdrop-blur-md hover:bg-black/70"
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
          <div className="flex items-center justify-center gap-8">
            <button
              onClick={handleCalibrate}
              className={`flex flex-col items-center justify-center h-16 w-16 rounded-full border-2 transition-all active:scale-90 shadow-lg backdrop-blur-md ${isCalibrated ? "border-green-500/50 bg-green-500/20 text-green-400" : "border-white/50 bg-white/10 text-white hover:bg-white/20"}`}
            >
              <Scan className="h-6 w-6 mb-0.5" />
              <span className="text-[10px] font-bold leading-none">
                {isCalibrated ? "Ready" : "Set Base"}
              </span>
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
