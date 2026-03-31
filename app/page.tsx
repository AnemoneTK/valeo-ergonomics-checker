"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Activity, Smartphone, ChevronRight } from "lucide-react";

export default function MainMenu() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 shadow-2xl mb-6">
          <Activity className="h-8 w-8 text-indigo-400" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
          Valeo AI Vision Hub
        </h1>
        <p className="text-gray-400">เลือกโหมดการทำงานของระบบ AI</p>
      </div>

      {/* Menu Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        {/* Card 1: Ergonomics */}
        <button
          onClick={() => router.push("/ergonomics")}
          className="group relative text-left p-8 rounded-3xl bg-gradient-to-br from-indigo-900/40 to-black border border-indigo-500/30 hover:border-indigo-400/60 transition-all hover:scale-[1.02] shadow-lg overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity">
            <Activity className="h-24 w-24 text-indigo-300" />
          </div>
          <div className="relative z-10">
            <div className="bg-indigo-500/20 text-indigo-300 text-xs font-bold px-3 py-1 rounded-full inline-block mb-4">
              AI Pose Tracking
            </div>
            <h2 className="text-2xl font-bold mb-2">Ergonomics Pro</h2>
            <p className="text-sm text-gray-400 mb-8 max-w-[80%]">
              ระบบตรวจจับสรีระและประเมินความเสี่ยงออฟฟิศซินโดรมแบบ Real-time
            </p>
            <div className="flex items-center text-indigo-400 font-semibold text-sm group-hover:translate-x-2 transition-transform">
              เปิดใช้งานระบบ <ChevronRight className="h-4 w-4 ml-1" />
            </div>
          </div>
        </button>

        {/* Card 2: Phone Detection */}
        <button
          onClick={() => router.push("/phone-detect")}
          className="group relative text-left p-8 rounded-3xl bg-gradient-to-br from-orange-900/40 to-black border border-orange-500/30 hover:border-orange-400/60 transition-all hover:scale-[1.02] shadow-lg overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity">
            <Smartphone className="h-24 w-24 text-orange-300" />
          </div>
          <div className="relative z-10">
            <div className="bg-orange-500/20 text-orange-300 text-xs font-bold px-3 py-1 rounded-full inline-block mb-4">
              AI Object Detection
            </div>
            <h2 className="text-2xl font-bold mb-2">Phone Detector</h2>
            <p className="text-sm text-gray-400 mb-8 max-w-[80%]">
              ระบบสแกนและแจ้งเตือนการใช้งานโทรศัพท์มือถือในพื้นที่ปฏิบัติงาน
            </p>
            <div className="flex items-center text-orange-400 font-semibold text-sm group-hover:translate-x-2 transition-transform">
              เปิดใช้งานระบบ <ChevronRight className="h-4 w-4 ml-1" />
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
