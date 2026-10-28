import { useIssues, useSprints } from '../../state/queries';
import { Async } from '../../ui/Async';
import { PageHeader } from '../../ui/PageHeader';
import { StageNote } from '../../ui/StageNote';
import { useCurrentProject } from '../projects/ProjectRoute';

export function BoardPage() {
  const project = useCurrentProject();
  const sprints = useSprints(project.id);
  const issues = useIssues(project.id);
  return (
    <>
      <PageHeader title="Доска" />
      <Async query={sprints}>
        {(sprintList) => (
          <Async query={issues}>
            {(issueList) => {
              const active = sprintList.find((s) => s.state === 'active');
              return active ? (
                <p>
                  {active.name}: задач на доске{' '}
                  {issueList.filter((i) => i.sprintId === active.id).length}.
                </p>
              ) : (
                <p>Активного спринта нет.</p>
              );
            }}
          </Async>
        )}
      </Async>
      <StageNote stage={5} what="колонки, карточки и группировка" />
    </>
  );
}
