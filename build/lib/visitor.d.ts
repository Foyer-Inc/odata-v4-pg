import { Token } from "odata-v4-parser/lib/lexer";
import { Visitor } from "odata-v4-sql/lib/visitor";
import { SqlOptions } from "./index";
export declare const ODATA_TYPE = "@odata.type";
export declare const ODATA_TYPENAME = "@odata.type.name";
export declare class PGVisitor extends Visitor {
    parameters: any[];
    includes: PGVisitor[];
    constructor(options?: SqlOptions);
    from(table: string): string;
    protected VisitExpand(node: Token, context: any): void;
    protected VisitEnum(node: Token, context: any): void;
    protected VisitEnumValue(node: Token, context: any): void;
    protected VisitEnumerationMember(node: Token, context: any): void;
    protected VisitEnumMemberValue(node: Token, context: any): void;
    protected VisitSelectItem(node: Token, context: any): void;
    protected VisitODataIdentifier(node: Token, context: any): void;
    protected VisitEqualsExpression(node: Token, context: any): void;
    protected VisitNotEqualsExpression(node: Token, context: any): void;
    protected VisitLiteral(node: Token, context: any): void;
    protected VisitMethodCallExpression(node: Token, context: any): void;
}
