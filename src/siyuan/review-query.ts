export function buildReviewBlocksByTagStmt(input: { notebookIds: string[]; tag: string }): string {
  const notebookList = input.notebookIds.map((id) => `"${escapeSql(id)}"`).join(",");
  const tag = escapeSql(input.tag);

  return `
select distinct
  scope.id,
  scope.root_id as docId,
  scope.box as notebookId,
  scope.type as blockType,
  scope.content,
  scope.markdown,
  d.content as docTitle,
  d.hpath as path,
  scope.updated
from spans s
join blocks tagged on tagged.id = s.block_id
left join blocks parent on parent.id = tagged.parent_id
join blocks scope on scope.id = case
  when tagged.type <> 'd' and parent.type = 'i' then parent.id
  else tagged.id
end
join blocks d on d.id = scope.root_id
where s.type like '%tag%'
  and s.content = '${tag}'
  and tagged.box in (${notebookList})
  and tagged.type in ('d', 'p', 'h', 'l', 'i', 'b')
  and scope.type in ('d', 'p', 'h', 'l', 'i', 'b')
order by scope.updated desc
`;
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''").replaceAll('"', '""');
}
