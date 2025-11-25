'use client';

import { useQuery } from '@tanstack/react-query';
import { getHukamnama, type HukamnamaData } from '@/sgpc-scraper-script/actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function HukamnamaDisplay() {
  const { data, isLoading, error } = useQuery<HukamnamaData>({
    queryKey: ['hukamnama'],
    queryFn: getHukamnama,
  });

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto text-center text-red-500">
        Error loading Hukamnama. Please try again later.
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl md:text-3xl font-bold text-primary">
            {data.title}
          </CardTitle>
          <CardDescription className="text-lg font-medium mt-2">
            {data.date}
          </CardDescription>
          {data.ang && (
            <p className="text-sm text-muted-foreground font-semibold">
              {data.ang}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {data.lines.map((line, index) => (
            <div key={index} className="flex flex-col gap-2 p-4 rounded-lg hover:bg-accent/5 transition-colors border-b last:border-0">
              <p className="text-lg md:text-xl text-center leading-loose font-medium text-foreground">
                {line.gurmukhi}
              </p>
              {line.translation && (
                <p className="text-base md:text-lg text-muted-foreground text-center italic">
                  {line.translation}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

