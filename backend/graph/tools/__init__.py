"""Agent tool registry -- all tools available to the ReAct agent."""

from graph.tools.knowledge_base import (
    search_knowledge_base,
    find_entities,
    get_communications,
)
from graph.tools.workspace import create_node, update_node_properties
from graph.tools.email import send_email

ALL_TOOLS = [
    search_knowledge_base,
    find_entities,
    get_communications,
    create_node,
    update_node_properties,
    send_email,
]
