import { useSprints } from '../../state/queries';
import { Async } from '../../ui/Async';
import { PageHeader } from '../../ui/PageHeader';
import { StageNote } from '../../ui/StageNote';
import { useCurrentProject } from '../projects/ProjectRoute';

export function ReportsPage() {
  const project = useCurrentProject();
  const sprints = useSprints(project.id);
  return (
    <>
      <PageHeader title="Отчёты" />
      <Async query={sprints}>
        {(list) => <p>Закрытых спринтов: {list.filter((s) => s.state === 'closed').length}.</p>}
      </Async>
      <StageNote stage={7} what="burndown, velocity и итоги по людям" />
    </>
  );
}
