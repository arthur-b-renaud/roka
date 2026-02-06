import { Sidebar } from "@/components/sidebar/sidebar";
import { SearchDialog } from "@/components/sidebar/search-dialog";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-background">
        {children}
      </main>
      <SearchDialog />
      <KeyboardShortcuts />
    </div>
  );
}
