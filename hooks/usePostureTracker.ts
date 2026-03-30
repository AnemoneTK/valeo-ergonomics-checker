// hooks/usePostureTracker.ts
import { useRef, useEffect, useState, useCallback } from "react";
import Webcam from "react-webcam";
import type { Results, Landmark } from "@mediapipe/pose";

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

const DEFAULT_BASELINE = { neckLean: 10, headDrop: 1.0, shoulderWidth: 0.3 };
const CONFIG = {
  NECK_DEVIATION: 15,
  HEAD_DROP_DEVIATION: 0.15,
  SHOULDER_HUNCH_RATIO: 0.95,
  SIDEWAYS_RATIO: 0.8,
  TIME_LIMIT_SECONDS: 5,
};

export type PostureLevel = "good" | "warning" | "bad" | "none";

export type SegmentColors = {
  neck: string;
  shoulders: string;
  leftArm: string;
  rightArm: string;
  torso: string;
  leftLeg: string;
  rightLeg: string;
  leftWrist: string;
  rightWrist: string;
};

const DEFAULT_SEGMENT_COLORS: SegmentColors = {
  neck: "#22c55e",
  shoulders: "#22c55e",
  leftArm: "#22c55e",
  rightArm: "#22c55e",
  torso: "#22c55e",
  leftLeg: "#22c55e",
  rightLeg: "#22c55e",
  leftWrist: "#22c55e",
  rightWrist: "#22c55e",
};

export function usePostureTracker() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef<any>(null);
  const requestRef = useRef<number | null>(null);

  const [isTracking, setIsTracking] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [level, setLevel] = useState<PostureLevel>("none");
  const [duration, setDuration] = useState(0);

  const [baseline, setBaseline] = useState(DEFAULT_BASELINE);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [segmentColors, setSegmentColors] = useState<SegmentColors>(
    DEFAULT_SEGMENT_COLORS,
  );

  const [debugInfo, setDebugInfo] = useState({
    poseType: "-",
    neckLean: 0,
    headDrop: 0,
    wristAngle: 180,
    shoulderHunch: 100,
    landmarks: [] as Landmark[],
  });
  const [autoCalibrateEvent, setAutoCalibrateEvent] = useState(0);
  const [calibrateRejectEvent, setCalibrateRejectEvent] = useState(0);

  const isTrackingRef = useRef(isTracking);
  const badPostureStartTimeRef = useRef<number | null>(null);
  const postureChangeStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

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
    return (
      Math.acos(Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2)))) *
      (180.0 / Math.PI)
    );
  };

  const onResults = useCallback(
    (results: Results) => {
      if (!webcamRef.current?.video) return;

      if (results.poseLandmarks && isTrackingRef.current) {
        const landmarks = results.poseLandmarks;
        const nose = landmarks[MP_POSE.NOSE];
        const leftEar = landmarks[MP_POSE.LEFT_EAR];
        const rightEar = landmarks[MP_POSE.RIGHT_EAR];
        const leftShoulder = landmarks[MP_POSE.LEFT_SHOULDER];
        const rightShoulder = landmarks[MP_POSE.RIGHT_SHOULDER];
        const leftHip = landmarks[MP_POSE.LEFT_HIP];
        const rightHip = landmarks[MP_POSE.RIGHT_HIP];
        const rightKnee = landmarks[MP_POSE.RIGHT_KNEE];
        const rightAnkle = landmarks[MP_POSE.RIGHT_ANKLE];
        const leftElbow = landmarks[MP_POSE.LEFT_ELBOW];
        const leftWrist = landmarks[MP_POSE.LEFT_WRIST];
        const rightElbow = landmarks[MP_POSE.RIGHT_ELBOW];
        const rightWrist = landmarks[MP_POSE.RIGHT_WRIST];

        // 🌟 ฟังก์ชันหาค่ากลางแบบฉลาด (ยิ่งชัด ยิ่งดึงมาหาตัว)
        const getWeightedMidpoint = (p1: Landmark, p2: Landmark) => {
          const v1 = p1.visibility || 0.01;
          const v2 = p2.visibility || 0.01;
          return {
            x: (p1.x * v1 + p2.x * v2) / (v1 + v2),
            y: (p1.y * v1 + p2.y * v2) / (v1 + v2),
          };
        };

        // 🌟 ใช้สมการใหม่ทั้งหมด! ทำให้เส้นแกนตัวเกาะสมจริง 100% แม้จะหันตัว
        const midEar = getWeightedMidpoint(leftEar, rightEar);
        const midShoulder = getWeightedMidpoint(leftShoulder, rightShoulder);

        const absoluteVertical = { x: midShoulder.x, y: midShoulder.y - 1 };
        const currentNeckLean = calculateAngle2D(
          absoluteVertical,
          midShoulder,
          midEar,
        );

        const currentShoulderWidth = Math.sqrt(
          Math.pow(leftShoulder.x - rightShoulder.x, 2) +
            Math.pow(leftShoulder.y - rightShoulder.y, 2),
        );

        const headDropDist = midShoulder.y - nose.y;
        const currentHeadDrop =
          currentShoulderWidth > 0.05
            ? headDropDist / currentShoulderWidth
            : 1.0;

        const leftWristAngle =
          leftElbow.visibility! > 0.5 &&
          landmarks[MP_POSE.LEFT_INDEX].visibility! > 0.5
            ? calculateAngle2D(
                leftElbow,
                leftWrist,
                landmarks[MP_POSE.LEFT_INDEX],
              )
            : 180;
        const rightWristAngle =
          rightElbow.visibility! > 0.5 &&
          landmarks[MP_POSE.RIGHT_INDEX].visibility! > 0.5
            ? calculateAngle2D(
                rightElbow,
                rightWrist,
                landmarks[MP_POSE.RIGHT_INDEX],
              )
            : 180;

        const worstWristAngle = Math.min(leftWristAngle, rightWristAngle);

        let currentPoseType = "นั่งโต๊ะ (Desk)";
        if ((rightKnee?.visibility || 0) > 0.5) {
          const kneeAngle = calculateAngle3D(rightHip, rightKnee, rightAnkle);
          if (kneeAngle > 160) currentPoseType = "ยืน (Standing)";
          else if (kneeAngle < 130 && rightAnkle.y - rightHip.y < 0.25)
            currentPoseType = "นั่งพื้น (Floor)";
          else if (kneeAngle < 130) currentPoseType = "ย่อตัว (Squatting)";
          else currentPoseType = "นั่งเก้าอี้ (Chair)";
        }

        const isTurnedSideways =
          isCalibrated &&
          (currentShoulderWidth <
            baseline.shoulderWidth * CONFIG.SIDEWAYS_RATIO ||
            currentShoulderWidth > baseline.shoulderWidth * 1.25);

        if (isTurnedSideways) {
          if (postureChangeStartTimeRef.current === null) {
            postureChangeStartTimeRef.current = Date.now();
          } else if (
            (Date.now() - postureChangeStartTimeRef.current) / 1000 >=
            5
          ) {
            const isPostureStrictlyGood =
              currentNeckLean < 22 && currentHeadDrop > 0.5;

            if (isPostureStrictlyGood) {
              setBaseline({
                neckLean: currentNeckLean,
                headDrop: currentHeadDrop,
                shoulderWidth: currentShoulderWidth,
              });
              postureChangeStartTimeRef.current = null;
              setAutoCalibrateEvent(Date.now());
            } else {
              setCalibrateRejectEvent(Date.now());
              postureChangeStartTimeRef.current = Date.now();
            }
          }
        } else {
          postureChangeStartTimeRef.current = null;
        }

        if (isTurnedSideways) {
          currentPoseType += " (เรียนรู้ท่าใหม่...)";
        }

        const isTurtleNeck =
          !isTurnedSideways &&
          currentNeckLean > baseline.neckLean + CONFIG.NECK_DEVIATION;
        const isLookingDown =
          !isTurnedSideways &&
          currentHeadDrop < baseline.headDrop - CONFIG.HEAD_DROP_DEVIATION;
        const isHunching =
          !isTurnedSideways &&
          currentShoulderWidth <
            baseline.shoulderWidth * CONFIG.SHOULDER_HUNCH_RATIO;

        const isLeftWristBent = leftWristAngle < 145;
        const isRightWristBent = rightWristAngle < 145;

        setDebugInfo({
          poseType: currentPoseType,
          neckLean: Math.round(currentNeckLean),
          headDrop: Math.round(currentHeadDrop * 100) / 100,
          wristAngle: Math.round(worstWristAngle),
          shoulderHunch: Math.round(
            (currentShoulderWidth / (baseline.shoulderWidth || 1)) * 100,
          ),
          landmarks: landmarks,
        });

        const newColors: SegmentColors = { ...DEFAULT_SEGMENT_COLORS };

        if (isTurnedSideways) {
          newColors.neck = "#9ca3af";
          newColors.torso = "#9ca3af";
          newColors.shoulders = "#9ca3af";
        } else {
          if (isTurtleNeck || isLookingDown) newColors.neck = "#ef4444";
          if (isHunching && isCalibrated) newColors.shoulders = "#ef4444";
        }

        if (isLeftWristBent) newColors.leftWrist = "#ef4444";
        if (isRightWristBent) newColors.rightWrist = "#ef4444";

        setSegmentColors(newColors);

        const isBadPosture =
          isTurtleNeck ||
          isLookingDown ||
          isLeftWristBent ||
          isRightWristBent ||
          (isHunching && isCalibrated);

        let currentLevel: PostureLevel = "good";
        if (isBadPosture) {
          if (badPostureStartTimeRef.current === null)
            badPostureStartTimeRef.current = Date.now();
          if (
            (Date.now() - badPostureStartTimeRef.current) / 1000 >=
            CONFIG.TIME_LIMIT_SECONDS
          ) {
            currentLevel = "bad";
          } else {
            currentLevel = "warning";
          }
        } else {
          if (!isBadPosture) badPostureStartTimeRef.current = null;
          else if (badPostureStartTimeRef.current !== null) {
            if (
              (Date.now() - badPostureStartTimeRef.current) / 1000 >=
              CONFIG.TIME_LIMIT_SECONDS
            ) {
              currentLevel = "bad";
            } else {
              currentLevel = "warning";
            }
          }
        }
        setLevel(currentLevel);
      } else {
        setLevel("none");
        badPostureStartTimeRef.current = null;
        postureChangeStartTimeRef.current = null;
        setDebugInfo({
          poseType: "-",
          neckLean: 0,
          headDrop: 0,
          wristAngle: 180,
          shoulderHunch: 100,
          landmarks: [],
        });
      }
    },
    [baseline, isCalibrated],
  );

  useEffect(() => {
    if (typeof window === "undefined" || poseRef.current) return;
    let isCancelled = false;

    const mpPose = require("@mediapipe/pose");
    const PoseConstructor = mpPose.Pose || (window as any).Pose;
    if (!PoseConstructor) return;

    const pose = new PoseConstructor({
      locateFile: (f: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
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
        } catch (error) {}
      }
      if (isTrackingRef.current && isLoopRunning)
        requestRef.current = requestAnimationFrame(processFrame);
    };

    if (isTracking && isCameraReady) {
      interval = setInterval(() => setDuration((prev) => prev + 1), 1000);
      requestRef.current = requestAnimationFrame(processFrame);
    } else {
      setDuration(0);
      setLevel("none");
      badPostureStartTimeRef.current = null;
      if (canvasRef.current)
        canvasRef.current
          .getContext("2d")
          ?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      isLoopRunning = false;
      clearInterval(interval);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isTracking, isCameraReady]);

  const calibrate = () => {
    const landmarks = debugInfo.landmarks;
    let currentShoulderWidth = 0.3;
    if (landmarks && landmarks.length > 12) {
      currentShoulderWidth = Math.sqrt(
        Math.pow(landmarks[11].x - landmarks[12].x, 2) +
          Math.pow(landmarks[11].y - landmarks[12].y, 2),
      );
    }

    setBaseline({
      neckLean: debugInfo.neckLean,
      headDrop: debugInfo.headDrop,
      shoulderWidth: currentShoulderWidth,
    });
    setIsCalibrated(true);
  };

  return {
    webcamRef,
    canvasRef,
    isTracking,
    setIsTracking,
    isCameraReady,
    setIsCameraReady,
    level,
    duration,
    debugInfo,
    calibrate,
    isCalibrated,
    segmentColors,
    autoCalibrateEvent,
    calibrateRejectEvent,
  };
}
