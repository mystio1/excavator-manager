"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerAction, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Create Your Business Account</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="businessName" className="text-base">
              Business Name
            </Label>
            <Input id="businessName" name="businessName" required className="h-12 text-base" autoFocus />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ownerName" className="text-base">
              Your Name
            </Label>
            <Input id="ownerName" name="ownerName" required className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone" className="text-base">
              Mobile Number
            </Label>
            <Input id="phone" name="phone" type="tel" required className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-base">
              Email
            </Label>
            <Input id="email" name="email" type="email" required className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-base">
              Password
            </Label>
            <Input id="password" name="password" type="password" required minLength={6} className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="businessCode" className="text-base">
              Business Code (Optional)
            </Label>
            <Input
              id="businessCode"
              name="businessCode"
              placeholder="Leave blank to auto-generate"
              maxLength={20}
              className="h-12 text-base uppercase"
            />
            <p className="text-xs text-muted-foreground">
              Operators will use this to join your business. Pick something memorable, or leave it blank and we&rsquo;ll
              generate one for you.
            </p>
          </div>
          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
          <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending}>
            {isPending ? "Creating account..." : "Create Account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline underline-offset-4">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
