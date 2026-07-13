export default function InboxLoading() {
  return (
    <div className="flex h-full">
      {/* Conversation list skeleton */}
      <aside className="w-[320px] border-r border-[#2d333b] bg-[#0d1117] p-3">
        <div className="mb-3 h-9 rounded-md bg-[#161b22] animate-pulse" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="mb-2 flex gap-3 rounded-md border border-transparent p-2"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="h-10 w-10 shrink-0 rounded-full bg-[#161b22] animate-pulse" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="h-3 w-3/4 rounded bg-[#161b22] animate-pulse" />
              <div className="h-2.5 w-1/2 rounded bg-[#161b22] animate-pulse" />
            </div>
          </div>
        ))}
      </aside>

      {/* Chat area skeleton */}
      <section className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-[#2d333b] bg-[#161b22] p-3">
          <div className="h-10 w-10 rounded-full bg-[#0d1117] animate-pulse" />
          <div className="flex flex-col gap-1">
            <div className="h-3 w-32 rounded bg-[#0d1117] animate-pulse" />
            <div className="h-2.5 w-20 rounded bg-[#0d1117] animate-pulse" />
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-hidden p-4">
          {Array.from({ length: 5 }).map((_, i) => {
            const outbound = i % 2 === 1;
            return (
              <div
                key={i}
                className={`flex ${outbound ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`h-14 w-2/3 rounded-2xl animate-pulse ${
                    outbound ? "bg-[#1e3a8a]/40" : "bg-[#161b22]"
                  }`}
                />
              </div>
            );
          })}
        </div>

        <div className="border-t border-[#2d333b] p-3">
          <div className="h-10 rounded-md bg-[#161b22] animate-pulse" />
        </div>
      </section>
    </div>
  );
}
