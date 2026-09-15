export function RadiusSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input aria-label="新活动提示半径" type="range" min={0} max={30} step={1} value={value}
    onChange={(event) => onChange(Number(event.target.value))} style={{width:'100%',height:36,accentColor:'#29BBA7'}} />;
}
