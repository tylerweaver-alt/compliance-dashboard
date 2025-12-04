"use client";

import Image from "next/image";
import Link from "next/link";
import acadianAiIcon from "@/public/Images/Acadian_Intelligence_Icon.png";

export default function AcadianIntelligenceButton() {
  return (
    <Link href="/AcadianIntelligence">
      <div
        className="
          inline-flex items-center justify-center
          cursor-pointer
          transition-all duration-300
          hover:scale-105
          hover:shadow-[0_0_25px_rgba(0,70,0,0.9)]
          rounded-full
        "
      >
        <Image
          src={acadianAiIcon}
          alt="Acadian Intelligence"
          width={84}
          height={84}
          className="select-none"
        />
      </div>
    </Link>
  );
}

