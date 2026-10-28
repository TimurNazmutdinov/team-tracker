import { useIssues } from '../../state/queries';
import { Async } from '../../ui/Async';
import { PageHeader } from '../../ui/PageHeader';
import { StageNote } from '../../ui/StageNote';
import { useCurrentProject } from '../projects/ProjectRoute';

export function BacklogPage() {
  const project = useCurrentProject();
  const issues = useIssues(project.id);
  return (
    <>
      <PageHeader title="Бэклог" />
      <Async query={issues}>
        {(list) => (
          <p>
            Задач вне спринтов: {list.filter((i) => i.sprintId === null).length}. Всего в проекте:{' '}
            {list.length}.
          </p>
        )}
      </Async>
      <StageNote stage={4} what="список задач, порядок и окно создания" />
    </>
  );
}
