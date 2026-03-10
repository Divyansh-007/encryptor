import { SetMetadata } from '@nestjs/common';

export const SKIP_ENCRYPTION_KEY = 'skipEncryption';

/**
 * Decorator to skip encryption for a specific route or controller.
 * 
 * @example
 * // Skip encryption for a single route
 * @SkipEncryption()
 * @Get('public')
 * getPublicData() {
 *   return { message: 'This response is not encrypted' };
 * }
 * 
 * @example
 * // Skip encryption for entire controller
 * @SkipEncryption()
 * @Controller('public')
 * export class PublicController {}
 */
export const SkipEncryption = () => SetMetadata(SKIP_ENCRYPTION_KEY, true);
