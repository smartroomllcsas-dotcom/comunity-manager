export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="flex items-center gap-3 text-[#8b949e]">
        <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span>Cargando...</span>
      </div>
    </div>
  );
}
