export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { Suspense } from "react";
import ParishReportContent from "./ParishReportContent";

function LoadingFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#1a1a1a',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ fontSize: '20px' }}>Loading report...</div>
    </div>
  );
}

export default async function ParishReportPage({
  searchParams,
}: {
  searchParams: Promise<{ parish?: string; start?: string; end?: string }>;
}) {
  const params = await searchParams;
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ParishReportContent
        parishId={params?.parish ?? null}
        startDate={params?.start ?? null}
        endDate={params?.end ?? null}
      />
    </Suspense>
  );
}
