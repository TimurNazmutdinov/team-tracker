import { usePeople } from '../../state/queries';
import { Async } from '../../ui/Async';
import { PageHeader } from '../../ui/PageHeader';
import { StageNote } from '../../ui/StageNote';

export function PeoplePage() {
  const people = usePeople();
  return (
    <>
      <PageHeader title="Люди" />
      <Async query={people}>
        {(list) => (
          <>
            <p>Участников: {list.length}.</p>
            <ul>
              {list.map((p) => (
                <li key={p.id}>
                  {p.name} — {p.role}
                </li>
              ))}
            </ul>
          </>
        )}
      </Async>
      <StageNote stage={7} what="нагрузка и задачи участников" />
    </>
  );
}
