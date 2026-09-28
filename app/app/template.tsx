export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-[page-in_300ms_var(--ease-sortie)_both]">
      {children}
    </div>
  );
}
