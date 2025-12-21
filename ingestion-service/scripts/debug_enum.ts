
import { PrismaClient, PlanId, OnboardingState } from '@prisma/client';

console.log('PlanId:', PlanId);
console.log('OnboardingState:', OnboardingState);

const prisma = new PrismaClient();
console.log('Prisma Client instantiated.');
