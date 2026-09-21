
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "../firebase";
export async function callFunction<TInput, TOutput>(name: string, input: TInput): Promise<TOutput> {
  const result = await httpsCallable<TInput, TOutput>(getFirebase().functions, name)(input);
  return result.data;
}
