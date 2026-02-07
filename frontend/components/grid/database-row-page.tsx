"use client";

import { PageHeader } from "@/components/editor/page-header";
import { PageEditor } from "@/components/editor/page-editor";
import { RowPropertiesPanel } from "./row-properties-panel";
import type { DbNode } from "@/lib/types/database";

interface DatabaseRowPageProps {
  node: DbNode;
}

/**
 * Full-page view for a database_row node.
 * Layout mirrors Notion: Title > Properties > Page content.
 * The row IS a page -- it has its own BlockNote editor for rich content,
 * and its properties come from the parent database's schema_config.
 */
export function DatabaseRowPage({ node }: DatabaseRowPageProps) {
  return (
    <div>
      <PageHeader node={node} />
      <RowPropertiesPanel node={node} />
      <PageEditor key={node.id} node={node} />
    </div>
  );
}
