import { Logger } from '@nestjs/common';

export function LogExecutionTime(): MethodDecorator {
  return (
    target: Object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    const originalMethod = descriptor.value;
    const logger = new Logger('LogExecutionTime');

    descriptor.value = async function (...args: any[]) {
      const now = Date.now();
      const result = await originalMethod.apply(this, args);
      const end = Date.now();
      const returnTime = {
        Method: String(propertyKey),
        Start: now,
        End: end,
        SpendTime: (end - now) / 1000,
      };

      logger.log(returnTime);

      return result;
    };

    return descriptor;
  };
}
