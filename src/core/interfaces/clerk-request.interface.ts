import { Request } from 'express';
import { User } from '../../database/schema/users.schema';

export interface ClerkRequest extends Request {
  clerkPayload?: {
    sub: string;
    [key: string]: unknown;
  };
  user?: User;
}
