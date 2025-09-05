import classNames from "@calcom/ui/classNames";

export function Logo({
  small,
  icon,
  inline = true,
  className,
  src = "/api/logo",
}: {
  small?: boolean;
  icon?: boolean;
  inline?: boolean;
  className?: string;
  src?: string;
}) {
  return (
    <h3 className={classNames("logo", inline && "inline", className)}>
      <strong>
        {icon ? (
          <img alt="Pluro" title="Pluro" src={`${src}?type=icon`} />
        ) : (
          <img style={{ height: "36px" }} alt="Pluro" title="Pluro" src={src} />
        )}
      </strong>
    </h3>
  );
}
