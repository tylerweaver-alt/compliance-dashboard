import Image from "next/image";
import Link from "next/link";

import acadianLogo from "@/public/Images/Acadian Logo Green.webp";
import comingSoonGraphic from "@/public/Images/AI Ad.png";
import acadianAiIcon from "@/public/Images/Acadian_Intelligence_Icon.png";

export default function AcadianIntelligencePage() {
  return (
    <main className="min-h-screen bg-[#0f2a1f] text-white flex flex-col items-center px-4 py-6">

      <div className="w-full max-w-5xl flex justify-start mb-4">
        <Link href="/" className="text-sm text-gray-300 hover:text-white transition">
          ← Back to Dashboard
        </Link>
      </div>

      <div className="flex flex-col items-center gap-2 mb-4">
        <h1 className="text-3xl font-bold tracking-wide">Acadian Intelligence</h1>

        <Image
          src={acadianAiIcon}
          alt="Acadian Intelligence Icon"
          width={90}
          height={90}
          className="drop-shadow-xl"
        />
      </div>

      <div className="
        w-full max-w-5xl
        bg-[#123425]/80
        border border-[#0c1f17]
        rounded-3xl shadow-2xl
        p-6 flex flex-col gap-6
      ">

        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <Image
            src={acadianLogo}
            alt="Acadian Logo"
            width={140}
            height={140}
            className="drop-shadow-xl"
          />

          <div className="max-w-sm">
            <Image
              src={comingSoonGraphic}
              alt="Acadian Intelligence Coming Soon"
              className="rounded-xl shadow-xl"
            />
          </div>
        </div>
      </div>
    </main>
  );
}

