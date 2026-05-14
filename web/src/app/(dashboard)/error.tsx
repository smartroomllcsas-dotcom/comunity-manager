"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-8 max-w-md text-center">
        <h2 className="text-xl font-bold text-white mb-2">Algo salio mal</h2>
        <p className="text-[#8b949e] mb-4">{error.message || "Ha ocurrido un error inesperado"}</p>
        <button
          onClick={reset}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}
