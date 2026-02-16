import { Sidebar, SidebarExpandButton } from "@/components/sidebar/sidebar";
import { SidebarProvider } from "@/components/sidebar/sidebar-context";
import { SearchDialog } from "@/components/sidebar/search-dialog";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { RealtimeProvider } from "@/components/providers/realtime-provider";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <RealtimeProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="relative flex-1 overflow-auto bg-background">
            <SidebarExpandButton />
            {children}
          </main>
          <SearchDialog />
          <KeyboardShortcuts />
        </div>
      </RealtimeProvider>
    </SidebarProvider>
  );
}
