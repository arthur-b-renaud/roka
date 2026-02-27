"""Agent tool registry -- all tools available to the ReAct agent.

For backward compatibility, ALL_TOOLS is still available.
New code should use graph.tools.registry.load_tools_for_agent() for dynamic loading.
"""

from graph.tools.knowledge_base import (
    search_knowledge_base,
    find_entities,
    get_communications,
)
from graph.tools.workspace import create_node, update_node_properties, append_text_to_page

ALL_TOOLS = [
    search_knowledge_base,
    find_entities,
    get_communications,
    create_node,
    update_node_properties,
    append_text_to_page,
]
