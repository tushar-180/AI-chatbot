export interface ProjectType {
  id: string;
  userId: string;
  name: string;
  description?: string;
  instructions?: string;
  memory?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  instructions?: string;
  memory?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  instructions?: string;
  memory?: string;
}
