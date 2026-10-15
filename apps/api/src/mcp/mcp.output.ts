import { recordPermissions } from './mcp.records';

const text = { type: 'string' },
  integer = { type: 'integer' },
  object = { type: 'object', additionalProperties: true };
const array = (items: Record<string, unknown> = object) => ({
  type: 'array',
  items,
});
const nullableText = { type: ['string', 'null'] };
const page = {
  items: array(),
  total: integer,
  page: integer,
  pageSize: integer,
  totalPages: integer,
};
const resolution = {
  resolution: { enum: ['RESOLVED', 'NEEDS_SELECTION'] },
  candidates: array(),
  next_page: { type: ['integer', 'null'] },
};
const provenance = {
  queried_at: { type: 'string', format: 'date-time' },
  authority: { const: 'WORKING_DATA_ONLY' },
};
const project = { project_id: { type: 'string', format: 'uuid' } };
const schemas: Record<string, Record<string, unknown>> = {
  galaxy_list_workspace_records: {
    ...page,
    ...provenance,
    record_type: { enum: ['campaign', 'marketing_content'] },
    scope: { const: 'AUTHORIZED_ORGANIZATION_RECORDS' },
  },
  galaxy_get_workspace_record: {
    record: object,
    ...provenance,
    record_type: { enum: ['campaign', 'marketing_content'] },
    scope: { const: 'AUTHORIZED_ORGANIZATION_RECORDS' },
    omitted_fields: array(text),
  },
  galaxy_get_workspace_context: {
    identity: {
      type: 'object',
      properties: { user_id: text, display_name: text },
      required: ['user_id', 'display_name'],
    },
    organization_id: text,
    granted_scopes: array(text),
    permissions: array(text),
    project_visibility: { const: 'AUTHORIZED_PROJECTS' },
    ...provenance,
  },
  galaxy_list_projects: page,
  galaxy_get_project: { project: object, ...resolution, ...provenance },
  galaxy_get_project_summary: { project: object, ...resolution, ...provenance },
  galaxy_list_files: {
    ...page,
    ...project,
    ...resolution,
    queried_at: provenance.queried_at,
  },
  galaxy_read_file: {
    file_id: text,
    file_name: text,
    mime_type: text,
    size_bytes: { type: 'string', pattern: '^[0-9]+$' },
    checksum: nullableText,
    version: integer,
    download_url: { type: 'string', format: 'uri' },
    expires_at: provenance.queried_at,
    text: object,
    text_error: text,
  },
  galaxy_get_project_memory: {
    ...project,
    ...resolution,
    ...provenance,
    items: array(),
    nextCursor: nullableText,
  },
  galaxy_save_project_note: { ...project, memory: object },
  galaxy_update_project_note: { ...project, memory: object },
  galaxy_create_task: { ...project, operation_id: text, task: object },
  galaxy_update_task: { ...project, operation_id: text, task: object },
  galaxy_list_project_records: {
    ...page,
    ...project,
    ...provenance,
    next_page: { type: ['integer', 'null'] },
    record_type: { enum: Object.keys(recordPermissions) },
  },
  galaxy_get_record: {
    ...project,
    ...provenance,
    record_type: { enum: Object.keys(recordPermissions) },
    record: object,
  },
  galaxy_list_jobs: {
    ...resolution,
    items: array(),
    next_cursor: nullableText,
    scope: { const: 'AUTHORIZED_OWN_JOBS' },
    queried_at: provenance.queried_at,
  },
  galaxy_search: {
    query: text,
    page: integer,
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          entityType: {
            enum: [
              'Customer',
              'Contact',
              'Lead',
              'Opportunity',
              'Project',
              'Task',
              'File',
            ],
          },
          total: integer,
          items: array(),
        },
        required: ['entityType', 'total', 'items'],
      },
    },
  },
};

/** Domain records retain permission-dependent fields; the envelope remains explicit. */
export function businessOutput(name: string) {
  const properties = schemas[name];
  return properties
    ? { type: 'object', properties, additionalProperties: true }
    : undefined;
}
