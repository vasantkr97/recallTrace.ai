import type { MemoryGraphResponse } from "@recalltrace/contracts";
import type { GraphRepository } from "../hydradb/graphRepository.js";
import type { EntityResolver } from "./entityResolver.js";

export class GraphService {
  constructor(
    private readonly repository: GraphRepository,
    private readonly entities: EntityResolver
  ) {}

  async read(actorName: string): Promise<MemoryGraphResponse | null> {
    const actor = this.entities.resolveActor(actorName);
    return this.repository.readActorGraph(actor.canonicalKey);
  }
}
