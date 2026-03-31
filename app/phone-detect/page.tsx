"use client";

import React, { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Webcam from "react-webcam";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import type { Results, Landmark } from "@mediapipe/pose";
import {
  ArrowLeft,
  Smartphone,
  ShieldCheck,
  AlertTriangle,
  FlipHorizontal,
  Settings,
  Loader2,
} from "lucide-react";

// 🌟 ตัวแปร Singleton สำหรับ MediaPipe ป้องกัน WebAssembly Crash ตอนเปลี่ยนหน้า
let globalPhonePoseInstance: any = null;
let isPhonePoseInitializing = false;

export default function PhoneDetector() {
  const router = useRouter();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // State สำหรับโมเดลและสถานะ
  const [cocoModel, setCocoModel] = useState<cocoSsd.ObjectDetection | null>(
    null,
  );
  const [isPoseReady, setIsPoseReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [isPhoneDetected, setIsPhoneDetected] = useState(false);
  const [detectReason, setDetectReason] = useState<string>(""); // เก็บเหตุผลว่าจับได้เพราะอะไร

  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    "environment",
  );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);

  const requestRef = useRef<number | null>(null);
  const poseResultsRef = useRef<Landmark[] | null>(null);
  const poseModelRef = useRef<any>(null);

  // 1. โหลด AI ทั้ง 2 ตัว (COCO-SSD และ MediaPipe Pose)
  useEffect(() => {
    const loadModels = async () => {
      setIsLoading(true);

      // โหลด COCO-SSD
      await tf.ready();
      const loadedCoco = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      setCocoModel(loadedCoco);

      // โหลด MediaPipe Pose แบบ Singleton
      if (globalPhonePoseInstance) {
        poseModelRef.current = globalPhonePoseInstance;
        globalPhonePoseInstance.onResults((results: Results) => {
          if (results.poseLandmarks)
            poseResultsRef.current = results.poseLandmarks;
        });
        setIsPoseReady(true);
      } else if (!isPhonePoseInitializing) {
        isPhonePoseInitializing = true;
        const mpPose = require("@mediapipe/pose");
        const PoseConstructor = mpPose.Pose || (window as any).Pose;
        if (PoseConstructor) {
          const pose = new PoseConstructor({
            locateFile: (f: string) =>
              `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
          });
          pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });

          pose.onResults((results: Results) => {
            if (results.poseLandmarks)
              poseResultsRef.current = results.poseLandmarks;
          });

          await pose.initialize();
          globalPhonePoseInstance = pose;
          poseModelRef.current = pose;
          setIsPoseReady(true);
          isPhonePoseInitializing = false;
        }
      }

      setIsLoading(false);
    };

    loadModels();

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((mediaDevices) => {
        setDevices(mediaDevices.filter(({ kind }) => kind === "videoinput"));
      });
    }
  }, []);

  // 2. ฟังก์ชัน Loop ตรวจจับคู่ขนาน (Parallel Detection)
  useEffect(() => {
    if (!cocoModel || !isPoseReady) return;

    let isLoopRunning = true;

    const detectObjects = async () => {
      if (!isLoopRunning) return;

      const video = webcamRef.current?.video;
      const canvas = canvasRef.current;

      if (
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        canvas
      ) {
        if (
          canvas.width !== video.videoWidth ||
          canvas.height !== video.videoHeight
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        try {
          // 🚀 ส่งภาพเข้า AI 2 ตัวพร้อมกัน (ลดการคอขวด)
          const [predictions] = await Promise.all([
            cocoModel.detect(video),
            poseModelRef.current.send({ image: video }), // จะอัปเดตค่าไปที่ poseResultsRef.current อัตโนมัติ
          ]);

          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let phoneFound = false;
            let reason = "";

            // ----------------------------------------------------
            // 🎯 Lvl 1: ตรวจจับวัตถุด้วย COCO-SSD (ตาเหยี่ยว)
            // ----------------------------------------------------
            predictions.forEach((prediction) => {
              if (
                prediction.class === "cell phone" &&
                prediction.score > 0.45
              ) {
                phoneFound = true;
                reason = "ตรวจพบวัตถุโทรศัพท์มือถือ";

                const [x, y, width, height] = prediction.bbox;
                ctx.strokeStyle = "#f97316";
                ctx.lineWidth = 4;
                ctx.strokeRect(x, y, width, height);

                ctx.fillStyle = "#f97316";
                ctx.fillRect(x, y - 30, width, 30);
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 16px sans-serif";
                ctx.fillText(
                  `📱 Phone ${Math.round(prediction.score * 100)}%`,
                  x + 10,
                  y - 10,
                );
              }
            });

            // ----------------------------------------------------
            // 🎯 Lvl 2: วิเคราะห์พฤติกรรมด้วย Pose (ถ้าวัตถุโดนบัง)
            // ----------------------------------------------------
            const landmarks = poseResultsRef.current;
            if (landmarks && !phoneFound) {
              const nose = landmarks[0];
              const lEar = landmarks[7];
              const rEar = landmarks[8];
              const lShoulder = landmarks[11];
              const rShoulder = landmarks[12];
              const lWrist = landmarks[15];
              const rWrist = landmarks[16];

              // ฟังก์ชันคำนวณระยะห่าง (Euclidean Distance)
              const getDist = (p1: Landmark, p2: Landmark) =>
                Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

              // ใช้ความกว้างไหล่เป็นมาตรวัดระยะอ้างอิง เพื่อให้คำนวณแม่นยำไม่ว่าจะนั่งใกล้หรือไกลกล้อง
              const shoulderDist = getDist(lShoulder, rShoulder) || 0.1;

              const lWristVis = (lWrist.visibility || 0) > 0.5;
              const rWristVis = (rWrist.visibility || 0) > 0.5;

              // 📞 2.1 ท่าคุยโทรศัพท์ (ข้อมือแนบหู)
              // ถ้าระยะห่างระหว่าง ข้อมือ กับ หู น้อยกว่า 60% ของความกว้างไหล่ = คุยมือถือชัวร์
              if (
                lWristVis &&
                (lEar.visibility || 0) > 0.5 &&
                getDist(lWrist, lEar) < shoulderDist * 0.6
              ) {
                phoneFound = true;
                reason = "วิเคราะห์ท่าทาง: กำลังคุยโทรศัพท์";
              }
              if (
                rWristVis &&
                (rEar.visibility || 0) > 0.5 &&
                getDist(rWrist, rEar) < shoulderDist * 0.6
              ) {
                phoneFound = true;
                reason = "วิเคราะห์ท่าทาง: กำลังคุยโทรศัพท์";
              }

              // 💬 2.2 ท่าก้มพิมพ์/เล่นมือถือ (ข้อมือสองข้างประกบกันตรงหน้าอก)
              if (!phoneFound && lWristVis && rWristVis) {
                const wristsDist = getDist(lWrist, rWrist); // ระยะห่างมือซ้าย-ขวา
                const midWristY = (lWrist.y + rWrist.y) / 2; // ระดับความสูงของมือ
                const midShoulderY = (lShoulder.y + rShoulder.y) / 2;

                // เงื่อนไข: มือใกล้กันมาก + มืออยู่ต่ำกว่าจมูก + มืออยู่สูงกว่าลิ้นปี่
                if (
                  wristsDist < shoulderDist * 0.8 &&
                  midWristY > nose.y &&
                  midWristY < midShoulderY + shoulderDist * 0.8
                ) {
                  phoneFound = true;
                  reason = "วิเคราะห์ท่าทาง: กำลังก้มเล่นโทรศัพท์";
                }
              }

              // วาดโครงกระดูกจางๆ ให้รู้ว่า AI กำลังจับท่าทางอยู่
              ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
              ctx.lineWidth = 2;
              if (lWristVis) {
                ctx.beginPath();
                ctx.arc(
                  lWrist.x * canvas.width,
                  lWrist.y * canvas.height,
                  5,
                  0,
                  2 * Math.PI,
                );
                ctx.stroke();
              }
              if (rWristVis) {
                ctx.beginPath();
                ctx.arc(
                  rWrist.x * canvas.width,
                  rWrist.y * canvas.height,
                  5,
                  0,
                  2 * Math.PI,
                );
                ctx.stroke();
              }
            }

            setIsPhoneDetected(phoneFound);
            if (phoneFound) setDetectReason(reason);
          }
        } catch (error) {
          console.warn("Detection skipped this frame...");
        }
      }

      requestRef.current = requestAnimationFrame(detectObjects);
    };

    requestRef.current = requestAnimationFrame(detectObjects);

    return () => {
      isLoopRunning = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [cocoModel, isPoseReady]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col font-sans overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm">
          <Loader2 className="h-16 w-16 text-orange-500 animate-spin mb-4" />
          <h2 className="text-white text-xl font-bold tracking-widest">
            LOADING AI HYBRID MODEL...
          </h2>
          <p className="text-gray-400 text-sm mt-2">
            ผสานระบบ Object Detection + Pose Behavior
          </p>
        </div>
      )}

      {/* 🟢 แจ้งเตือนสเตตัสด้านบนจอ */}
      <div
        className={`absolute top-0 left-0 right-0 z-40 transition-colors duration-500 ${isPhoneDetected ? "bg-orange-500/90" : "bg-green-500/90"} shadow-2xl`}
      >
        <div className="flex flex-col items-center justify-center py-3 px-4">
          <div className="flex items-center gap-3">
            {isPhoneDetected ? (
              <>
                <AlertTriangle className="h-6 w-6 text-white animate-pulse" />
                <span className="text-white font-bold text-lg tracking-wide uppercase">
                  ตรวจพบการใช้งานโทรศัพท์มือถือ!
                </span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-6 w-6 text-white" />
                <span className="text-white font-bold text-lg tracking-wide uppercase">
                  พื้นที่ปลอดภัย (ไม่พบโทรศัพท์)
                </span>
              </>
            )}
          </div>
          {/* ✅ บอกเหตุผลว่าจับได้เพราะอะไร */}
          {isPhoneDetected && (
            <span className="text-white/90 text-sm mt-1 font-medium bg-black/20 px-3 py-0.5 rounded-full">
              {detectReason}
            </span>
          )}
        </div>
      </div>

      <div className="relative h-full w-full pt-16">
        <button
          onClick={() => {
            window.location.href = "/";
          }}
          className="absolute top-24 left-6 z-50 flex items-center justify-center h-10 w-10 rounded-full bg-black/50 text-white backdrop-blur-md border border-white/10 hover:bg-white/20 transition-all cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="absolute top-24 right-6 z-30 flex flex-col items-end gap-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-3 rounded-full bg-black/50 text-white backdrop-blur-md border border-white/10 hover:bg-white/20 transition-all"
          >
            <Settings className="h-5 w-5" />
          </button>

          {showSettings && (
            <div className="p-4 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/10 flex flex-col gap-3 animate-in fade-in slide-in-from-right-4 w-48">
              <label className="text-xs text-gray-400">เลือกกล้อง</label>
              <select
                className="bg-gray-800 text-white text-sm rounded-lg p-2 border border-gray-700 outline-none w-full"
                value={selectedDevice}
                onChange={(e) => {
                  setSelectedDevice(e.target.value);
                  setFacingMode("environment");
                }}
              >
                <option value="">- อัตโนมัติ -</option>
                {devices.map((device, key) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${key + 1}`}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  setFacingMode((prev) =>
                    prev === "user" ? "environment" : "user",
                  );
                  setSelectedDevice("");
                }}
                className="flex items-center justify-center gap-2 mt-2 w-full py-2 bg-gray-800 rounded-lg text-sm text-white hover:bg-gray-700"
              >
                <FlipHorizontal className="h-4 w-4" /> สลับกล้อง
              </button>
            </div>
          )}
        </div>

        <div className="absolute inset-0 w-full h-full overflow-hidden">
          <Webcam
            ref={webcamRef}
            videoConstraints={
              selectedDevice
                ? { deviceId: { exact: selectedDevice } }
                : { facingMode: facingMode }
            }
            className="w-full h-full object-cover"
            style={{
              transform: facingMode === "user" ? "scaleX(-1)" : "scaleX(1)",
            }}
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none z-10"
            style={{
              transform: facingMode === "user" ? "scaleX(-1)" : "scaleX(1)",
            }}
          />

          <div
            className={`absolute inset-0 pointer-events-none border-[12px] transition-colors duration-300 z-20 ${isPhoneDetected ? "border-orange-500/80 animate-pulse" : "border-transparent"}`}
          />
        </div>
      </div>
    </div>
  );
}
