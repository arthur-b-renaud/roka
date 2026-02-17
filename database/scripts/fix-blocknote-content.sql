-- Fix corrupted BlockNote content where each character is a separate block
-- This happens when content was entered one character at a time

DO $$
DECLARE
    node_record RECORD;
    content_json JSONB;
    fixed_content JSONB;
    combined_text TEXT;
    block_array JSONB[];
    single_block JSONB;
BEGIN
    -- Loop through all pages with content
    FOR node_record IN 
        SELECT id, title, content 
        FROM nodes 
        WHERE type = 'page' 
        AND content IS NOT NULL 
        AND content != '[]'::jsonb
    LOOP
        content_json := node_record.content;
        
        -- Check if content has many single-character blocks (likely corrupted)
        IF jsonb_array_length(content_json) > 10 THEN
            -- Extract all text from blocks
            combined_text := '';
            
            FOR i IN 0..jsonb_array_length(content_json)-1 LOOP
                -- Get text from each block's content array
                IF content_json->i->'content' IS NOT NULL THEN
                    FOR j IN 0..jsonb_array_length(content_json->i->'content')-1 LOOP
                        IF content_json->i->'content'->j->>'text' IS NOT NULL THEN
                            combined_text := combined_text || (content_json->i->'content'->j->>'text');
                        END IF;
                    END LOOP;
                END IF;
            END LOOP;
            
            -- If we extracted text, create a single proper block
            IF LENGTH(combined_text) > 0 THEN
                single_block := jsonb_build_object(
                    'id', gen_random_uuid()::text,
                    'type', 'paragraph',
                    'props', jsonb_build_object(
                        'textColor', 'default',
                        'backgroundColor', 'default',
                        'textAlignment', 'left'
                    ),
                    'content', jsonb_build_array(
                        jsonb_build_object(
                            'type', 'text',
                            'text', combined_text,
                            'styles', jsonb_build_object()
                        )
                    ),
                    'children', jsonb_build_array()
                );
                
                fixed_content := jsonb_build_array(single_block);
                
                -- Update the node with fixed content
                UPDATE nodes 
                SET content = fixed_content,
                    search_text = node_record.title || ' ' || combined_text
                WHERE id = node_record.id;
                
                RAISE NOTICE 'Fixed content for node % (%) - combined % blocks into 1', 
                    node_record.id, node_record.title, jsonb_array_length(content_json);
            END IF;
        END IF;
    END LOOP;
END $$;
