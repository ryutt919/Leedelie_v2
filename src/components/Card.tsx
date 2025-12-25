import React from 'react';

interface CardProps {
  children: React.ReactNode;
  title?: string;
}

export function Card({ children, title }: CardProps) {
  return (
    <div className="card">
      {title && <div className="card-header"><h3>{title}</h3></div>}
      <div className="card-body">{children}</div>
    </div>
  );
}
