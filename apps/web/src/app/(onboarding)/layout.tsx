import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-end gap-2 px-4 py-3 md:px-8">
        <ThemeSwitcher />
        <LocaleSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-12 pt-4 md:pt-8">
        {children}
      </main>
    </div>
  );
}
